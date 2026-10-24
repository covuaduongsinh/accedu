import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri (apps/desktop) dùng chính bản build này; TAURI_ENV_* có khi chạy qua `tauri dev/build`.
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 5173, strictPort: true, host: process.env.TAURI_DEV_HOST || "localhost" },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: isTauri ? "safari16" : "es2022",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    chunkSizeWarningLimit: 2000,
  },
});
