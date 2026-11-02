import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
    watch: {
      ignored: [
        "**/backend/**",
        "**/.local/**",
        "**/.test/**",
        "**/screenshots/**",
        "**/scripts/**",
        "**/dist/**",
        "**/qa*-results.json",
      ],
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
