# Storage

BranchWhisper currently uses local files instead of a central database.

## Storage Root

```text
runtime/
```

## Rules

- User data and generated files do not go into Git.
- Public URLs for uploads and stickers are served through `/runtime/uploads` and `/runtime/stickers`.
- Keep old JSON and SQLite formats compatible unless a migration script is provided.

## Future Work

The current `backend/data/` and `backend/repositories/` layers overlap. Fold them together later in a small refactor.
