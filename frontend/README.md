# Frontend

BranchWhisper now uses Vue 3, Vite, TypeScript, Pinia, Vue Router, and `@lucide/vue`.

## Commands

```bash
cd frontend
npm install
npm run dev
npm run check
npm run build
```

Development server:

```text
http://127.0.0.1:5173
```

Built app through FastAPI:

```text
http://127.0.0.1:7860/app
```

The FastAPI root `/` also serves the built Vue app when `frontend/dist/index.html` exists.

## Structure

```text
src/
  api/          typed API clients
  components/   shared layout and reusable UI
  pages/        route-level pages
  router/       Vue Router setup
  stores/       Pinia stores
  styles/       global styles and page layouts
```
