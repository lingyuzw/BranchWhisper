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
    return main(args)


if __name__ == "__main__":
    raise SystemExit(replay_main())
