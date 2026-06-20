# Optimization Runbook

Use this runbook after optimization, refactor, diagnostics, runtime data, or frontend page changes.

## Backend Runtime

Start the backend from the `qwen3-asr` conda environment:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python backend/main.py --host 127.0.0.1 --port 7860
```

The frontend dev server can be started separately:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run dev
```

Open the console at:

```text
http://127.0.0.1:5173/app/
```

## Full Regression

Run these commands before calling a pass complete:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest discover -s backend/tests -p "test_*.py" -v
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m compileall backend services
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python scripts/check_static_imports.py
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper node --test backend/tests/test_weixin_voice_sender.mjs
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run build
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check:ui
```

## Runtime Data Check

Runtime JSON files are expected to use the shared atomic writer. Confirm no direct business JSON writes remain with:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper bash -lc 'git grep -n -e write_text -e write_json_file -- backend/core backend/data backend/engagement backend/integration_runtime backend/media backend/tools'
```

Acceptable results are imports or calls to `write_json_file`; direct `write_text(json.dumps(...))` in runtime code should be treated as a new safety task.

## Frontend Visual Check

After page or CSS changes, run:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper/frontend npm run check:ui
```

For visual changes, also inspect these routes in a browser:

```text
/app/
/app/services
/app/diagnostics
/app/integrations
/app/memory
/app/assets
/app/settings
```

The diagnostics page should keep labels, target values, status tags, failure reasons, and repair suggestions aligned in one continuous layout.

For desktop-app foundation work, confirm the backend can serve the production frontend after `npm run build`:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python -m unittest backend.tests.test_frontend_serving -v
```

## Git Loop

For each small optimization point:

```powershell
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git status --short --branch
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git diff --check
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git add <files>
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git commit -m <message>
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper git push
```

Do not commit `runtime/`, generated frontend `dist/`, caches, model files, logs, databases, or credentials.
