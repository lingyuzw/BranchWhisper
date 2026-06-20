# Local Deployment

## Start Backend

```bash
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python backend/main.py --host 127.0.0.1 --port 7860
```

## Start With Service Config

```bash
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python backend/main.py --host 0.0.0.0 --port 7860 --service-config runtime/service_profiles.json
```

Service config paths support portable tokens:

```text
${PROJECT_ROOT}
${WORKSPACE_ROOT}
```

By default `${WORKSPACE_ROOT}` is the parent directory of the BranchWhisper repository. If your models live elsewhere, set it before starting the backend:

```bash
export BRANCHWHISPER_WORKSPACE_ROOT=/home/me/workspace
wsl -d Ubuntu-24.04 --cd /home/me/workspace/BranchWhisper /home/me/miniconda3/bin/conda run -n qwen3-asr python backend/main.py --host 0.0.0.0 --port 7860 --service-config runtime/service_profiles.json
```

## Open UI

```text
http://127.0.0.1:7860
```

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

## Notes

The frontend is the Vue/Vite app in `frontend/`. Run `npm run build` in `frontend/` before serving production assets from `frontend/dist/`.
