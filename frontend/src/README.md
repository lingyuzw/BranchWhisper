# Vue Source

This directory contains the production BranchWhisper frontend.

The frontend should only depend on public backend boundaries:

- `/api/*`
- `/ws/dialog`
- `/runtime/uploads/*`
- `/runtime/stickers/*`

Keep API clients in `api/`, persistent page state in `stores/`, and route-level layout in `pages/`.
