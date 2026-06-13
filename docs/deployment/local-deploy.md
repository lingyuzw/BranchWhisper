# Local Deployment

## Start Backend

```bash
python backend/main.py --host 127.0.0.1 --port 7860
```

## Start With Service Config

```bash
python backend/main.py --host 0.0.0.0 --port 7860 --service-config runtime/service_profiles.json
```

Service config paths support portable tokens:

```text
${PROJECT_ROOT}
${WORKSPACE_ROOT}
```

By default `${WORKSPACE_ROOT}` is the parent directory of the BranchWhisper repository. If your models live elsewhere, set it before starting the backend:

```bash
export BRANCHWHISPER_WORKSPACE_ROOT=/home/me/workspace
python backend/main.py --host 0.0.0.0 --port 7860 --service-config runtime/service_profiles.json
```

## Open UI

```text
http://127.0.0.1:7860
```

## Notes

The frontend is the Vue/Vite app in `frontend/`. Run `npm run build` in `frontend/` before serving production assets from `frontend/dist/`.
