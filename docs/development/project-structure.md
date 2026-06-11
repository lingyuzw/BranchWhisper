# Project Structure

```text
backend/    FastAPI app and runtime orchestration
frontend/   browser UI
runtime/    local user data
services/   standalone local services
configs/    local service configs
scripts/    startup and validation scripts
docs/       architecture and developer docs
web/        compatibility wrapper only
```

## Development Rule

Add new backend features under `backend/`. Add new frontend work under `frontend/`. Do not add new runtime data under `web/`.

## Compatibility Rule

Keep `web/web_server.py` until downstream scripts have migrated to `backend/main.py`.
