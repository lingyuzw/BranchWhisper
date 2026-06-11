# Media Module

## Responsibility

Handles avatars, chat images, sticker upload, sticker processing, sticker metadata, and vision-based sticker analysis.

## Current Path

```text
backend/media/
```

## Runtime Files

- `runtime/uploads/`
- `runtime/stickers/`
- `runtime/stickers.json`

## Public URLs

- `/runtime/uploads/*`
- `/runtime/stickers/*`

## Modification Notes

Keep public URL generation compatible with the static mounts in `backend/app/server.py`.
