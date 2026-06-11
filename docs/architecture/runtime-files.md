# Runtime Files

`runtime/` contains local user data and generated files. It is ignored by Git except for `runtime/README.md`.

## Back Up

Back up this directory before moving machines or doing risky migrations:

```text
runtime/
```

## Important Files

- `settings.json`: main app settings.
- `service_profiles.json`: ASR, LLM, and TTS service commands.
- `integrations.json`: external integration instances.
- `tool_providers.json`: third-party tool provider config.
- `bot_profiles.json`: bot profiles.
- `memory.sqlite3`: memory database.
- `proactive.sqlite3`: proactive message database.
- `reminders.sqlite3`: reminder database.

## Important Directories

- `conversations/`: conversation history.
- `uploads/`: user-uploaded avatars, images, and stickers.
- `stickers/`: processed sticker library.
- `integration_media/`: external-platform media files.
- `logs/`: service logs and PID files.

## Cleanup Rule

Do not delete `runtime/` blindly. If a cleanup tool is added later, it must distinguish cache files from user assets.
