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
- `tools.json`: built-in and custom tool runtime config.
- `proactive_config.json`: proactive behavior config.
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

## Write Safety

JSON runtime files are written through the shared atomic JSON writer. This includes settings, service profiles, bot profiles, tool provider config, tool runtime config, integration config, Weixin account state, proactive config, sticker indexes, and conversation JSON files.

The writer creates a temporary file in the same directory, flushes it, fsyncs it, then replaces the destination. If the replace fails, the previous destination file is preserved and the temporary file is removed.

SQLite databases such as `memory.sqlite3`, `proactive.sqlite3`, and `reminders.sqlite3` keep their own transaction semantics. Back them up as a group with the rest of `runtime/`.

## Log Retention

`runtime/logs/` is user-owned operational evidence. BranchWhisper should not silently delete service logs. For routine maintenance, archive or remove old logs manually after copying anything needed for debugging.

Suggested local policy:

- Keep the most recent logs while actively tuning services.
- Archive logs before deleting them when a failure is still under investigation.
- Never delete `runtime/logs/` together with databases, uploads, stickers, or integration media as a broad cleanup step.
