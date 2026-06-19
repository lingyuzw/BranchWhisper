from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from dialog.naturalness_eval import main


def replay_main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if "--output" not in args:
        args.extend(["--output", str(ROOT / "runtime" / "dialog-naturalness-live-report.txt")])
    if "--format" not in args:
        args.extend(["--format", "text"])
    if "--json-output" not in args and "--format" in args:
        format_index = args.index("--format")
        output_format = args[format_index + 1] if format_index + 1 < len(args) else ""
        if output_format == "text":
            output_path = Path(args[args.index("--output") + 1]) if "--output" in args else ROOT / "runtime" / "dialog-naturalness-live-report.txt"
            args.extend(["--json-output", str(output_path.with_suffix(".json"))])
    return main(args)


if __name__ == "__main__":
    raise SystemExit(replay_main())
