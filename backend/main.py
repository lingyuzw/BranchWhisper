from __future__ import annotations

import sys


def main() -> None:
    if sys.argv[1:3] == ["--integration-bridge", "openclaw"]:
        from integration_runtime.openclaw_bridge import main as bridge_main

        sys.argv = [sys.argv[0], *sys.argv[3:]]
        raise SystemExit(bridge_main())

    from app.server import main as server_main

    server_main()


if __name__ == "__main__":
    main()
