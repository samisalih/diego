/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base so the built app also loads from file:// inside Electron later.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: { name: "web", include: ["test/**/*.test.{ts,tsx}"], environment: "jsdom" },
});
