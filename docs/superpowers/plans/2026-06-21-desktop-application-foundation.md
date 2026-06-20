# Desktop Application Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the first desktop-application foundation phase: the backend must reliably serve the production Vue app at `/app/` without Vite, and the repo must document API-first desktop onboarding.

**Architecture:** Keep FastAPI as the single business entrypoint and Vue as the UI. This phase does not add the desktop shell yet; it verifies and hardens the existing production-frontend serving path so later Tauri/Electron work only needs to launch the backend.

**Tech Stack:** FastAPI, Vue/Vite, Python unittest, frontend `npm run build`, repository docs.

---

## File Map

- `docs/development/desktop-application-design.md`: final design reference for desktop app, API quick mode, local runtime mode, UI layout, and acceptance criteria.
- `docs/superpowers/plans/2026-06-21-desktop-application-foundation.md`: this implementation plan.
- `backend/tests/test_frontend_serving.py`: new backend regression tests for production frontend serving.
- `backend/app/server.py`: only modify if tests reveal missing behavior.
- `docs/deployment/local-deploy.md`: update if production frontend serving instructions are incomplete.
- `docs/development/optimization-runbook.md`: update if the regression loop needs an explicit production frontend serving check.

## Task 1: Commit Design And Plan

**Files:**
- Create: `docs/development/desktop-application-design.md`
- Create: `docs/superpowers/plans/2026-06-21-desktop-application-foundation.md`

- [ ] **Step 1: Check the documentation diff**

Run:

```bash
git diff -- docs/development/desktop-application-design.md docs/superpowers/plans/2026-06-21-desktop-application-foundation.md
```

Expected: only the new design and plan documents appear.

- [ ] **Step 2: Verify no unwanted files are staged**

Run:

```bash
git status --short --branch
```

Expected: the two new docs are untracked, and unrelated untracked files such as `docs/hardware/` remain untracked.

- [ ] **Step 3: Stage only the design and plan**

Run:

```bash
git add docs/development/desktop-application-design.md docs/superpowers/plans/2026-06-21-desktop-application-foundation.md
```

- [ ] **Step 4: Commit the design and plan**

Run:

```bash
git commit -m "docs: define desktop application foundation"
```

Expected: commit succeeds and includes only the two docs.

- [ ] **Step 5: Push the documentation commit**

Run:

```bash
git push origin main
```

Expected: remote `main` updates.

## Task 2: Add Backend Production Frontend Serving Tests

**Files:**
- Create: `backend/tests/test_frontend_serving.py`
- May modify: `backend/app/server.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_frontend_serving.py` with tests that use `unittest`, `tempfile.TemporaryDirectory`, and `unittest.mock.patch` to override `app.server.FRONTEND_DIST_DIR` before calling `create_app`.

Test cases:

```python
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.server import create_app


def args() -> SimpleNamespace:
    return SimpleNamespace(
        host="127.0.0.1",
        port=7860,
        service_config="",
        vad_device="cpu",
    )


class FrontendServingTests(unittest.TestCase):
    def test_root_redirects_to_app_when_dist_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp)
            (dist / "assets").mkdir()
            (dist / "index.html").write_text("<!doctype html><div id=\"app\"></div>", encoding="utf-8")
            with patch("app.server.FRONTEND_DIST_DIR", dist):
                client = TestClient(create_app(args()))
                response = client.get("/", follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        self.assertEqual(response.headers["location"], "/app/")

    def test_app_routes_return_vue_shell_when_dist_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp)
            (dist / "assets").mkdir()
            (dist / "index.html").write_text("<!doctype html><title>BranchWhisper</title>", encoding="utf-8")
            with patch("app.server.FRONTEND_DIST_DIR", dist):
                client = TestClient(create_app(args()))
                response = client.get("/app/settings")
        self.assertEqual(response.status_code, 200)
        self.assertIn("BranchWhisper", response.text)
        self.assertEqual(response.headers["cache-control"], "no-store, max-age=0")

    def test_missing_dist_returns_clear_503(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp) / "missing"
            with patch("app.server.FRONTEND_DIST_DIR", dist):
                client = TestClient(create_app(args()))
                response = client.get("/app/")
        self.assertEqual(response.status_code, 503)
        self.assertIn("Frontend is not built", response.json()["error"])
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_frontend_serving -v
```

Expected before implementation: at least one test fails if production serving behavior or argument setup is incomplete. If all tests already pass, record that existing code already satisfies the behavior and continue to Task 3 without modifying `backend/app/server.py`.

- [ ] **Step 3: Implement the minimal fix if needed**

If tests fail because `create_app` requires additional args, update the test `args()` helper with the exact defaults used by `build_parser()`.

If tests fail because app routes do not serve the Vue shell or missing dist does not produce a clear 503, modify only the relevant route logic in `backend/app/server.py`:

```python
@app.get("/")
async def index():
    index_path = FRONTEND_DIST_DIR / "index.html"
    if index_path.exists():
        return RedirectResponse(url="/app/")
    raise HTTPException(status_code=503, detail="Frontend is not built. Run `cd frontend && npm run build`.")


@app.get("/app")
@app.get("/app/{path:path}")
async def vue_app(path: str = ""):
    index_path = FRONTEND_DIST_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path, headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"})
    raise HTTPException(status_code=503, detail="Frontend is not built. Run `cd frontend && npm run build`.")
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_frontend_serving -v
```

Expected: all tests in `FrontendServingTests` pass.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add backend/tests/test_frontend_serving.py backend/app/server.py
git commit -m "test: cover production frontend serving"
git push origin main
```

If `backend/app/server.py` was not changed, do not stage it.

## Task 3: Add Production Frontend Serving To The Runbook

**Files:**
- Modify: `docs/deployment/local-deploy.md`
- Modify: `docs/development/optimization-runbook.md`

- [ ] **Step 1: Update local deployment instructions**

Add a section to `docs/deployment/local-deploy.md` after `Open UI`:

```markdown
## Production Frontend

For desktop-app style startup, build the Vue app first:

```bash
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run build
```

Then start the backend and open:

```text
http://127.0.0.1:7860/app/
```

This path does not require the Vite dev server. If `frontend/dist/index.html` is missing, the backend returns a clear 503 telling you to build the frontend.
```

- [ ] **Step 2: Update optimization runbook**

Add this check under `Frontend Visual Check` in `docs/development/optimization-runbook.md`:

```markdown
For desktop-app foundation work, confirm the backend can serve the production frontend after `npm run build`:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_frontend_serving -v
```
```

- [ ] **Step 3: Verify docs diff**

Run:

```bash
git diff -- docs/deployment/local-deploy.md docs/development/optimization-runbook.md
```

Expected: only the new production frontend instructions are present.

- [ ] **Step 4: Commit Task 3**

Run:

```bash
git add docs/deployment/local-deploy.md docs/development/optimization-runbook.md
git commit -m "docs: document production frontend serving"
git push origin main
```

## Task 4: Full Phase Verification

**Files:**
- No new files unless verification reveals a bug.

- [ ] **Step 1: Run backend frontend-serving test**

Run:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_frontend_serving -v
```

Expected: all frontend-serving tests pass.

- [ ] **Step 2: Run frontend checks and build**

Run:

```bash
cd frontend && npm run check:ui && npm run check && npm run build
```

Expected: UI structure checks pass, TypeScript passes, Vite build succeeds.

- [ ] **Step 3: Run existing backend smoke checks**

Run:

```bash
/home/me/miniconda3/bin/conda run -n qwen3-asr python -m compileall backend services
/home/me/miniconda3/bin/conda run -n qwen3-asr python scripts/check_static_imports.py
```

Expected: compileall succeeds and static imports check passes.

- [ ] **Step 4: Check git status**

Run:

```bash
git status --short --branch
```

Expected: branch is up to date with `origin/main`; unrelated untracked `docs/hardware/` may remain.

## Self-Review

- Spec coverage: this plan covers the first implementation phase from the design document, plus docs and regression checks needed before desktop shell work.
- Placeholder scan: no placeholder tasks are left; later phases are intentionally not implemented in this plan.
- Type consistency: backend test helper uses `SimpleNamespace` matching `create_app(args)` attribute access.
