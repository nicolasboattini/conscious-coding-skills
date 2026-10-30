#!/usr/bin/env python3
"""Hooks de live-development-roadmap.

  pedido   (UserPromptSubmit): en un repo con roadmap, recuerda al empezar
           el turno que todo cambio se registra en el tablero, con o sin plan.
  editado  (PostToolUse de Edit/Write): anota qué archivo se tocó en esta sesión.
  comando  (PostToolUse de Bash/PowerShell): después de un `git commit`, pide
           registrarlo en el momento, no al final del turno.
  cierre   (Stop): si quedaron commits, archivos editados o cambios sin
           commitear posteriores a la última sincronización, frena el turno
           una vez y pide actualizar el tablero. Anota la hora del cierre.
  corte    (StopFailure): el turno se cortó por un error de la API (límite
           de uso, sobrecarga...). Abre una pausa con esa hora.
  inicio   (SessionStart): al retomar una sesión, si pasó mucho tiempo, avisa.

Las pausas se registran en la colección `pausas` del tablero cuando vuelve
el trabajo (el hook no escribe en el artifact: le pasa los datos a Claude).

En un repo sin roadmap no hace nada. Un hook roto nunca rompe la sesión.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

RAIZ_PLUGIN = Path(os.environ.get("CLAUDE_PLUGIN_ROOT") or Path(__file__).resolve().parent.parent)
sys.path.insert(0, str(RAIZ_PLUGIN / "skills" / "live-development-roadmap" / "scripts"))
import ldr  # noqa: E402

AVISO_PROTOCOLO = (
    "Todo cambio de código se registra en el tablero, haya plan o no: un arreglo, un ajuste o una función suelta "
    "lleva su entregable (en curso al empezar, hecho al verificar) en la fase de trabajo suelto de la versión actual. "
    "Cada commit se registra apenas se hace (`ldr.py commit`). Ver la skill live-development-roadmap, sección "
    "\"Trabajo suelto\"."
)


# Una ausencia más larga que esto entre el fin de un turno y el siguiente
# pedido se ofrece registrar como pausa (esperando al usuario).
PAUSA_MIN = 30
MOTIVO_ERROR = {"rate_limit": "limite_uso"}


def hora_local(ts: float) -> str:
    return datetime.fromtimestamp(ts).astimezone().isoformat(timespec="seconds")


def aviso_pausa(cfg: dict, repo: Path | None, ahora: float, segundos_ausente: float | None = None) -> str | None:
    """Si hay una pausa abierta (corte de la API) o una ausencia larga, la
    cierra en la configuración local y devuelve el texto para registrarla."""
    abierta = cfg.get("pausaAbierta")
    if abierta:
        cfg.pop("pausaAbierta", None)
        if repo:
            ldr.guardar_config(repo, cfg)
        inicio = abierta.get("inicio")
        motivo = abierta.get("motivo", "otro")
        detalle = abierta.get("detalle", "")
        return (
            f"live-development-roadmap: el trabajo se cortó a las {inicio} ({motivo}{': ' + detalle if detalle else ''}) y vuelve ahora. "
            f"Registrá la pausa en el tablero: `pausas/<id>` con inicio {inicio}, fin {hora_local(ahora)}, motivo \"{motivo}\", "
            "detalle, version y entregable en curso si lo había. Si el límite se liberó antes de que volviera el usuario, "
            "partila en dos: limite_uso hasta la hora de liberación y espera_usuario hasta ahora."
        )
    ultimo = cfg.get("ultimoCierre")
    try:
        desde = datetime.fromisoformat(ultimo).timestamp() if ultimo else None
    except ValueError:
        desde = None
    if segundos_ausente is not None:
        desde = ahora - segundos_ausente
    if desde and ahora - desde >= PAUSA_MIN * 60:
        cfg.pop("ultimoCierre", None)
        if repo:
            ldr.guardar_config(repo, cfg)
        return (
            f"live-development-roadmap: pasaron {round((ahora - desde) / 60)} min sin trabajo ({hora_local(desde)} → {hora_local(ahora)}). "
            "Si había un entregable en curso, registrá esa ausencia en `pausas` (motivo espera_usuario, o fuera_de_horario si es fuera del horario de trabajo)."
        )
    return None


def registro(datos: dict) -> Path:
    return Path(tempfile.gettempdir()) / f"ldr-{datos.get('session_id', 'sesion')}.log"


def contexto(evento: str, texto: str) -> None:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": evento, "additionalContext": texto}}, ensure_ascii=False))


def desde_sincronizacion(cfg: dict) -> float:
    try:
        return datetime.fromisoformat(cfg.get("ultimaSincronizacion") or "").timestamp()
    except ValueError:
        return 0.0


def pedido(proyecto: str, datos: dict) -> None:
    cfg, commits = ldr.pendientes(proyecto)
    if not cfg:
        return
    partes = [f"Este repo tiene tablero en vivo ({cfg.get('url') or cfg.get('slug')}).", AVISO_PROTOCOLO]
    if commits:
        partes.append(f"Ya hay commits sin registrar: {'; '.join(commits[:6])}.")
    pausa = aviso_pausa(cfg, ldr.raiz(proyecto), time.time())
    if pausa:
        partes.append(pausa)
    contexto("UserPromptSubmit", " ".join(partes))


def corte(proyecto: str, datos: dict) -> None:
    repo, cfg = ldr.leer_config(proyecto)
    if not repo or not cfg or cfg.get("pausaAbierta"):
        return
    error = str(datos.get("error") or "unknown")
    detalle = str(datos.get("error_details") or datos.get("last_assistant_message") or "")[:200]
    cfg["pausaAbierta"] = {"inicio": hora_local(time.time()), "motivo": MOTIVO_ERROR.get(error, "otro"), "error": error, "detalle": detalle}
    ldr.guardar_config(repo, cfg)


def inicio(proyecto: str, datos: dict) -> None:
    if datos.get("source") not in ("resume", "fork"):
        return
    repo, cfg = ldr.leer_config(proyecto)
    if not repo or not cfg:
        return
    segundos = datos.get("seconds_since_last_response")
    texto = aviso_pausa(cfg, repo, time.time(), float(segundos) if isinstance(segundos, (int, float)) else None)
    if texto:
        contexto("SessionStart", texto)


def editado(proyecto: str, datos: dict) -> None:
    entrada = datos.get("tool_input") or {}
    ruta = entrada.get("file_path") or entrada.get("notebook_path") or entrada.get("path")
    if ruta:
        with registro(datos).open("a", encoding="utf-8") as f:
            f.write(f"{time.time():.0f}\t{ruta}\n")


def comando(proyecto: str, datos: dict) -> None:
    orden = str((datos.get("tool_input") or {}).get("command") or "")
    if "git commit" not in orden and "git merge" not in orden:
        return
    cfg, commits = ldr.pendientes(proyecto)
    if not cfg or not commits:
        return
    contexto(
        "PostToolUse",
        "live-development-roadmap: registrá ahora en el tablero "
        f"{'este commit' if len(commits) == 1 else 'estos commits'}: {'; '.join(commits[:6])}. "
        "`ldr.py commit <hash>` da las líneas por disciplina; sumalo al entregable y a `cambios`, "
        "y corré `ldr.py sincronizado`.",
    )


def cierre(proyecto: str, datos: dict) -> None:
    cfg, commits = ldr.pendientes(proyecto)
    if not cfg:
        return
    repo = ldr.raiz(proyecto)
    if repo:
        cfg["ultimoCierre"] = hora_local(time.time())
        ldr.guardar_config(repo, cfg)
    if datos.get("stop_hook_active"):
        return
    desde = desde_sincronizacion(cfg)
    archivos = set()
    log = registro(datos)
    if log.is_file() and repo:
        for linea in log.read_text(encoding="utf-8").splitlines():
            marca, _, ruta = linea.partition("\t")
            try:
                p = Path(ruta).resolve()
            except OSError:
                continue
            if float(marca or 0) > desde and repo in p.parents:
                archivos.add(p.relative_to(repo).as_posix())
    # Lo editado por consola (scripts, sed, etc.) no pasa por Edit/Write: se
    # mira también el árbol de trabajo.
    archivos.update(ldr.cambios_sin_commitear(proyecto, desde))
    archivos = sorted(archivos)
    if not commits and not archivos:
        return
    partes = ["live-development-roadmap: el tablero de este repo quedó atrás."]
    if commits:
        partes.append(f"Commits sin registrar: {'; '.join(commits[:6])}{' …' if len(commits) > 6 else ''}.")
    if archivos:
        partes.append(f"Archivos cambiados desde la última actualización: {', '.join(archivos[:8])}{' …' if len(archivos) > 8 else ''}.")
    partes.append(
        "Registrá el trabajo antes de terminar: el entregable (estado, horas, commits con `ldr.py commit`, verificación), "
        "aunque no haya plan (va a la fase de trabajo suelto de la versión actual), y corré `ldr.py sincronizado`. "
        "Solo si el usuario pidió no registrarlo, o si los cambios no son de esta sesión, decilo en una línea y terminá."
    )
    print(json.dumps({"decision": "block", "reason": " ".join(partes)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        datos = json.loads(sys.stdin.read() or "{}")
        proyecto = os.environ.get("CLAUDE_PROJECT_DIR") or datos.get("cwd") or "."
        {"pedido": pedido, "editado": editado, "comando": comando, "cierre": cierre, "corte": corte, "inicio": inicio}[sys.argv[1]](proyecto, datos)
    except Exception as e:  # noqa: BLE001
        print(f"live-development-roadmap hook: {e}", file=sys.stderr)
