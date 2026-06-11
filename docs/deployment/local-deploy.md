# Local Deployment

## Start Backend

```bash
python backend/main.py --host 127.0.0.1 --port 7860
```

## Start With Service Config

```bash
python backend/main.py --host 0.0.0.0 --port 7860 --service-config configs/voice_services.local.json
```

## Open UI

```text
http://127.0.0.1:7860
```

## Notes

The frontend is currently served by FastAPI from `frontend/legacy-static/`. A future Vue build can be served from `frontend/dist/` after migration.
