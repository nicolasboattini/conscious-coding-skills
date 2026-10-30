#!/usr/bin/env python3
"""Ayudante de live-development-roadmap (solo biblioteca estándar).

La configuración de cada proyecto vive FUERA del repo, en
~/.claude/live-development-roadmap/proyectos/<clave>.json, así el roadmap
no agrega archivos al código del proyecto. La clave sale de la carpeta raíz
del repo git.

Comandos:
  config                      muestra la configuración del repo actual (o avisa que no tiene roadmap)
  init --nombre N --slug S    crea o actualiza la configuración (ver --help)
  commit [REV]                estadísticas de un commit en JSON: hash, fecha, mensaje, +/-, líneas por disciplina
  commits --desde REV         lo mismo para cada commit desde REV (para cargar la historia)
  sincronizado                marca que el roadmap quedó al día con HEAD (lo lee el hook de cierre de turno)
  pendiente                   lista lo que falta registrar; sale con código 1 si hay algo

Con `init --ignorar PATRON` (repetible) se marcan archivos que cambian solos
(ej. next-env.d.ts) para que el hook de cierre no los cuente como trabajo.
"""
from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(os.environ.get("LDR_HOME") or Path.home() / ".claude" / "live-development-roadmap")


def git(*args: str, cwd: str | None = None) -> str | None:
    try:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    except OSError:
        return None
    return r.stdout if r.returncode == 0 else None


def raiz(cwd: str | None = None) -> Path | None:
    salida = git("rev-parse", "--show-toplevel", cwd=cwd)
    return Path(salida.strip()).resolve() if salida else None


def clave(repo: Path) -> str:
    nombre = re.sub(r"[^a-z0-9-]+", "-", repo.name.lower()).strip("-") or "repo"
    return f"{nombre}-{hashlib.sha1(str(repo).lower().encode()).hexdigest()[:8]}"


def ruta_config(repo: Path) -> Path:
    return BASE / "proyectos" / f"{clave(repo)}.json"


def leer_config(cwd: str | None = None) -> tuple[Path | None, dict | None]:
    repo = raiz(cwd)
    if not repo:
        return None, None
    ruta = ruta_config(repo)
    if not ruta.is_file():
        return repo, None
    try:
        return repo, json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return repo, None


def guardar_config(repo: Path, cfg: dict) -> Path:
    ruta = ruta_config(repo)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return ruta


def ahora_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def disciplina_de(ruta_archivo: str, reglas: list[dict]) -> str:
    """La primera regla cuyo patrón coincide gana; sin coincidencia, 'otros'."""
    for regla in reglas:
        for patron in regla.get("patrones", []):
            if fnmatch.fnmatch(ruta_archivo, patron) or ruta_archivo.startswith(patron.rstrip("*").rstrip("/") + "/"):
                return regla["id"]
    return "otros"


def stats_commit(rev: str, cfg: dict | None, cwd: str | None = None) -> dict | None:
    cab = git("show", "-s", "--format=%H%x1f%cI%x1f%s", rev, cwd=cwd)
    if not cab:
        return None
    h, en, mensaje = cab.strip().split("\x1f", 2)
    numstat = git("show", "--numstat", "--format=", rev, cwd=cwd) or ""
    reglas = (cfg or {}).get("disciplinas", [])
    mas = menos = 0
    lineas: dict[str, int] = {}
    for fila in numstat.splitlines():
        partes = fila.split("\t")
        if len(partes) != 3:
            continue
        a, b, archivo = partes
        a = int(a) if a.isdigit() else 0  # binarios vienen como "-"
        b = int(b) if b.isdigit() else 0
        if "=>" in archivo:  # renombre: "src/{a => b}/x.ts" o "a => b"
            archivo = re.sub(r"\{[^{}]*=> ([^{}]*)\}", r"\1", archivo).split(" => ")[-1].replace("//", "/")
        mas += a
        menos += b
        d = disciplina_de(archivo, reglas)
        lineas[d] = lineas.get(d, 0) + a + b
    return {"hash": h, "corto": h[:7], "en": en, "mensaje": mensaje, "mas": mas, "menos": menos, "lineas": lineas}


def cmd_config(args) -> int:
    repo, cfg = leer_config()
    if not repo:
        print("No es un repo git.")
        return 2
    if not cfg:
        print(f"Este repo no tiene roadmap. Configuración esperada en: {ruta_config(repo)}")
        return 1
    print(json.dumps(cfg, ensure_ascii=False, indent=2))
    return 0


def cmd_init(args) -> int:
    repo, cfg = leer_config()
    if not repo:
        print("No es un repo git.")
        return 2
    cfg = cfg or {}
    for campo in ("nombre", "slug", "url", "acento", "idioma", "redaccion", "prefijo"):
        valor = getattr(args, campo)
        if valor is not None:
            cfg[campo] = valor
    if args.ignorar:
        cfg["ignorar"] = [p for p in args.ignorar if p]
    if args.disciplina:
        reglas = []
        for d in args.disciplina:
            partes = d.split(":", 2)
            if len(partes) < 2:
                print(f"Disciplina mal formada: {d!r} (usar id:Nombre:patron1,patron2)")
                return 2
            reglas.append({"id": partes[0], "nombre": partes[1], "patrones": [p for p in (partes[2].split(",") if len(partes) > 2 else []) if p]})
        cfg["disciplinas"] = reglas
    cfg.setdefault("idioma", "es")
    cfg.setdefault("redaccion", "tech")
    cfg.setdefault("prefijo", "T")
    cfg["repo"] = str(repo)
    ruta = guardar_config(repo, cfg)
    print(f"Configuración guardada en {ruta}")
    print(json.dumps(cfg, ensure_ascii=False, indent=2))
    return 0


def cmd_commit(args) -> int:
    _, cfg = leer_config()
    s = stats_commit(args.rev, cfg)
    if not s:
        print(f"No encontré el commit {args.rev}.")
        return 2
    print(json.dumps(s, ensure_ascii=False))
    return 0


def cmd_commits(args) -> int:
    _, cfg = leer_config()
    revs = git("rev-list", "--reverse", "--no-merges", f"{args.desde}..{args.hasta}") or ""
    salida = [s for s in (stats_commit(r, cfg) for r in revs.split()) if s]
    print(json.dumps(salida, ensure_ascii=False, indent=1))
    return 0


def cmd_sincronizado(args) -> int:
    repo, cfg = leer_config()
    if not cfg:
        print("Este repo no tiene roadmap.")
        return 1
    cfg["ultimaSincronizacion"] = ahora_iso()
    head = git("rev-parse", "HEAD")
    if head:
        cfg["ultimoHeadSincronizado"] = head.strip()
    guardar_config(repo, cfg)
    print(f"Roadmap marcado como al día ({cfg['ultimaSincronizacion']}).")
    return 0


def pendientes(cwd: str | None = None) -> tuple[dict | None, list[str]]:
    """Commits posteriores a la última sincronización."""
    repo, cfg = leer_config(cwd)
    if not cfg:
        return None, []
    base = cfg.get("ultimoHeadSincronizado")
    if base and git("cat-file", "-e", f"{base}^{{commit}}", cwd=cwd) is not None:
        lista = git("log", "--format=%h %s", f"{base}..HEAD", cwd=cwd) or ""
    else:
        lista = git("log", "-5", "--format=%h %s", cwd=cwd) or ""
    return cfg, [l for l in lista.splitlines() if l.strip()]


def cambios_sin_commitear(cwd: str | None = None, desde: float = 0.0) -> list[str]:
    """Archivos con cambios sin commitear (modificados o nuevos) tocados
    después de `desde` (timestamp). Cubre lo editado por consola, que no pasa
    por las herramientas de edición. Omite los patrones de `ignorar`."""
    repo, cfg = leer_config(cwd)
    if not repo or not cfg:
        return []
    ignorar = cfg.get("ignorar", [])
    estado = git("status", "--porcelain", "--untracked-files=all", cwd=str(repo)) or ""
    salida = []
    for fila in estado.splitlines():
        ruta = fila[3:].split(" -> ")[-1].strip().strip('"')
        if not ruta or any(fnmatch.fnmatch(ruta, p) for p in ignorar):
            continue
        try:
            if (repo / ruta).stat().st_mtime <= desde:
                continue
        except OSError:
            pass  # borrado: cuenta
        salida.append(ruta)
    return sorted(salida)


def cmd_pendiente(args) -> int:
    cfg, lista = pendientes()
    if not cfg:
        print("Este repo no tiene roadmap.")
        return 0
    try:
        desde = datetime.fromisoformat(cfg.get("ultimaSincronizacion") or "").timestamp()
    except ValueError:
        desde = 0.0
    sucios = cambios_sin_commitear(desde=desde)
    if not lista and not sucios:
        print("Nada pendiente: el roadmap está al día.")
        return 0
    if lista:
        print("Commits sin registrar en el roadmap:")
        print("\n".join(f"  {l}" for l in lista))
    if sucios:
        print("Cambios sin commitear posteriores a la última actualización:")
        print("\n".join(f"  {r}" for r in sucios))
    return 1


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(prog="ldr.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("config").set_defaults(f=cmd_config)
    pi = sub.add_parser("init", help="crea o actualiza la configuración del repo actual")
    pi.add_argument("--nombre", help="nombre del proyecto, como se ve en el tablero")
    pi.add_argument("--slug", help="slug (UUID) del artifact del tablero")
    pi.add_argument("--url", help="link de claude.ai del tablero")
    pi.add_argument("--acento", help="color de acento, ej. #e0457b")
    pi.add_argument("--idioma", choices=["es", "en"])
    pi.add_argument("--redaccion", choices=["simple", "tech"], help="simple: para gerencia o áreas no técnicas; tech: detalle técnico")
    pi.add_argument("--prefijo", help="prefijo de los códigos de entregable (por defecto T → T001)")
    pi.add_argument("--disciplina", action="append", help="id:Nombre:patron1,patron2 (repetible; la primera que coincide gana)")
    pi.add_argument("--ignorar", action="append", help="patrón de archivos que cambian solos y no cuentan como trabajo (repetible)")
    pi.set_defaults(f=cmd_init)
    pc = sub.add_parser("commit")
    pc.add_argument("rev", nargs="?", default="HEAD")
    pc.set_defaults(f=cmd_commit)
    ps = sub.add_parser("commits")
    ps.add_argument("--desde", required=True)
    ps.add_argument("--hasta", default="HEAD")
    ps.set_defaults(f=cmd_commits)
    sub.add_parser("sincronizado").set_defaults(f=cmd_sincronizado)
    sub.add_parser("pendiente").set_defaults(f=cmd_pendiente)
    args = p.parse_args()
    return args.f(args)


if __name__ == "__main__":
    sys.exit(main())
