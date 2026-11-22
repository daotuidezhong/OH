import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: import.meta.dirname,
  publicDir: path.resolve(import.meta.dirname, "../public"),
  plugins: [react()],
  build: {
    outDir: path.resolve(import.meta.dirname, "../desktop-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        pomodoro: path.resolve(import.meta.dirname, "pomodoro.html"),
        theater: path.resolve(import.meta.dirname, "theater.html"),
      },
    },
  },
});
