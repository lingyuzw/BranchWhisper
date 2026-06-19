from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def run_step(label: str, command: list[str]) -> int:
    print(f"[quality] {label}", flush=True)
    result = subprocess.run(command, cwd=ROOT, text=True, check=False)
    if result.returncode != 0:
        print(f"[quality] {label} failed with exit code {result.returncode}", flush=True)
    return result.returncode


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run backend quality checks.")
    parser.add_argument(
        "--only-dialog-naturalness",
        action="store_true",
        help="Only run the dialog naturalness evaluation.",
    )
    args = parser.parse_args(argv)

    checks = [
        (
            "dialog naturalness",
            [sys.executable, str(ROOT / "scripts" / "evaluate_dialog_naturalness.py"), "--format", "text"],
        )
    ]
    if not args.only_dialog_naturalness:
        checks.insert(
            0,
            (
                "dialog regression tests",
                [
                    sys.executable,
                    "-m",
                    "unittest",
                    "backend.tests.test_dialog_naturalness_eval",
                    "backend.tests.test_dialog_regression",
                    "backend.tests.test_dialog_message_flow",
                ],
            ),
        )

    for label, command in checks:
        code = run_step(label, command)
        if code != 0:
            return code
    print("[quality] backend checks passed", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
