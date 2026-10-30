#!/usr/bin/env python3
"""Hooks de live-development-roadmap.

  editado  (PostToolUse de Edit/Write): anota qué archivo se tocó en esta sesión.
  cierre   (Stop): si el repo tiene roadmap y quedaron commits o archivos
           editados sin registrar desde la última sincronización, frena el
           turno una vez y pide actualizar el tablero.

En un repo sin roadmap no hace nada. Un hook roto nunca rompe la sesión.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path

RAIZ_PLUGIN = Path(os.environ.get("CLAUDE_PLUGIN_ROOT") or Path(__file__).resolve().parent.parent)
sys.path.insert(0, str(RAIZ_PLUGIN / "skills" / "live-development-roadmap" / "scripts"))
import ldr  # noqa: E402


def registro(datos: dict) -> Path:
    return Path(tempfile.gettempdir()) / f"ldr-{datos.get('session_id', 'sesion')}.log"


def editado(proyecto: str, datos: dict) -> None:
    entrada = datos.get("tool_input") or {}
    ruta = entrada.get("file_path") or entrada.get("notebook_path") or entrada.get("path")
    if ruta:
        with registro(datos).open("a", encoding="utf-8") as f:
            f.write(f"{time.time():.0f}\t{ruta}\n")


def cierre(proyecto: str, datos: dict) -> None:
    if datos.get("stop_hook_active"):
        return
    cfg, commits = ldr.pendientes(proyecto)
    if not cfg:
        return
    repo = ldr.raiz(proyecto)
    ultima = cfg.get("ultimaSincronizacion")
    desde = 0.0
    if ultima:
        try:
            from datetime import datetime
            desde = datetime.fromisoformat(ultima).timestamp()
        except ValueError:
            desde = 0.0
    archivos = []
    log = registro(datos)
    if log.is_file() and repo:
        for linea in log.read_text(encoding="utf-8").splitlines():
            marca, _, ruta = linea.partition("\t")
            try:
                p = Path(ruta).resolve()
            except OSError:
                continue
            if float(marca or 0) > desde and repo in p.parents:
                archivos.append(p.relative_to(repo).as_posix())
    archivos = sorted(set(archivos))
    if not commits and not archivos:
        return
    partes = ["live-development-roadmap: el tablero de este repo quedó atrás."]
    if commits:
        partes.append(f"Commits sin registrar: {'; '.join(commits[:6])}{' …' if len(commits) > 6 else ''}.")
    if archivos:
        partes.append(f"Archivos editados desde la última actualización: {', '.join(archivos[:8])}{' …' if len(archivos) > 8 else ''}.")
    partes.append("Actualizá el entregable (estado, horas, commits con `ldr.py commit`, verificación) y corré `ldr.py sincronizado`."
                  " Si no corresponde (una consulta, un cambio fuera del plan que no se registra), decilo en una línea y terminá.")
    print(json.dumps({"decision": "block", "reason": " ".join(partes)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        datos = json.loads(sys.stdin.read() or "{}")
        proyecto = os.environ.get("CLAUDE_PROJECT_DIR") or datos.get("cwd") or "."
        {"editado": editado, "cierre": cierre}[sys.argv[1]](proyecto, datos)
    except Exception as e:  # noqa: BLE001
        print(f"live-development-roadmap hook: {e}", file=sys.stderr)
