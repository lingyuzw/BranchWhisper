# web compatibility wrapper

`web/` is kept only as a compatibility layer for the old entrypoint.

Use the new backend entrypoint for normal development:

```bash
python backend/main.py --host 127.0.0.1 --port 7860
```

The old command still works during the migration:

```bash
python web/web_server.py --host 127.0.0.1 --port 7860
```
