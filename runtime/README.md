# Runtime

This directory contains local user data and generated files for BranchWhisper.

Most files in this directory are ignored by Git.

Typical contents:

- `settings.json`
- `service_profiles.json`
- `integrations.json`
- `tool_providers.json`
- `tools.json`
- `proactive_config.json`
- `bot_profiles.json`
- `memory.sqlite3`
- `proactive.sqlite3`
- `reminders.sqlite3`
- `conversations/`
- `logs/`
- `uploads/`
- `stickers/`
- `integration_media/`

Back up this directory before moving machines or doing risky migrations.

JSON config and index files are written with BranchWhisper's shared atomic JSON writer, so a failed write should preserve the previous file. SQLite databases still need normal database-aware care: back up `memory.sqlite3`, `proactive.sqlite3`, and `reminders.sqlite3` with the rest of this directory.

`logs/` is operational evidence, not disposable cache. BranchWhisper does not silently prune it. Archive or delete old logs manually only after you no longer need them for debugging.
