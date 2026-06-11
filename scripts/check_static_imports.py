from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = ROOT / "frontend" / "src"
IMPORT_RE = re.compile(r"""(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]""")
FORBIDDEN_RE = re.compile(r"(legacy-static|PageScaffold)")


def local_source_path(ref: str, base: Path) -> Path | None:
    if ref.startswith(("http://", "https://", "data:", "#")):
        return None
    if ref.startswith("@/"):
        return FRONTEND_SRC / ref.removeprefix("@/")
    if ref.startswith("."):
        return (base.parent / ref).resolve()
    return None


def check_source(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    if FORBIDDEN_RE.search(text):
        errors.append(f"{path.relative_to(ROOT)} still references legacy static scaffolding")
    for ref in IMPORT_RE.findall(text):
        target = local_source_path(ref, path)
        if not target:
            continue
        candidates = [target]
        if target.suffix == "":
            candidates.extend([target.with_suffix(ext) for ext in (".ts", ".vue", ".js")])
            candidates.extend([target / f"index{ext}" for ext in (".ts", ".vue", ".js")])
        if not any(candidate.exists() for candidate in candidates):
            errors.append(f"{path.relative_to(ROOT)} imports missing module {ref}")
    return errors


def main() -> int:
    errors: list[str] = []
    for path in sorted(FRONTEND_SRC.rglob("*")):
        if path.suffix not in {".ts", ".vue", ".js"}:
            continue
        errors.extend(check_source(path))
    if errors:
        for error in errors:
            print(error)
        return 1
    print("frontend source imports ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
