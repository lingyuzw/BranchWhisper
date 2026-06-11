from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "frontend" / "legacy-static"
IMPORT_RE = re.compile(r"""(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]""")
SCRIPT_RE = re.compile(r"""<script[^>]+src=['"]([^'"]+)['"]""", re.I)
LINK_RE = re.compile(r"""<link[^>]+href=['"]([^'"]+)['"]""", re.I)


def local_static_path(ref: str, base: Path) -> Path | None:
    if ref.startswith(("http://", "https://", "data:", "#")):
        return None
    if ref.startswith("/static/"):
        return STATIC_DIR / ref.removeprefix("/static/")
    if ref.startswith("/"):
        return ROOT / ref.lstrip("/")
    if ref.startswith("."):
        return (base.parent / ref).resolve()
    return None


def check_html(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    for ref in [*SCRIPT_RE.findall(text), *LINK_RE.findall(text)]:
        target = local_static_path(ref, path)
        if target and not target.exists():
            errors.append(f"{path.relative_to(ROOT)} references missing asset {ref} -> {target.relative_to(ROOT)}")
    return errors


def check_js(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    for ref in IMPORT_RE.findall(text):
        target = local_static_path(ref, path)
        if not target:
            continue
        candidates = [target]
        if target.suffix == "":
            candidates.extend([target.with_suffix(".js"), target / "index.js"])
        if not any(candidate.exists() for candidate in candidates):
            errors.append(f"{path.relative_to(ROOT)} imports missing module {ref}")
    return errors


def main() -> int:
    errors: list[str] = []
    for path in [STATIC_DIR / "index.html", *sorted((STATIC_DIR / "js").rglob("*.js"))]:
        if not path.exists():
            continue
        errors.extend(check_html(path) if path.suffix == ".html" else check_js(path))
    if errors:
        for error in errors:
            print(error)
        return 1
    print("static imports ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
