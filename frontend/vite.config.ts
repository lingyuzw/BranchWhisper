import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  base: "/app/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:7860",
      "/ws": {
        target: "ws://127.0.0.1:7860",
        ws: true,
      },
      "/runtime": "http://127.0.0.1:7860",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
