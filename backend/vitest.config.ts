import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@config": path.resolve(__dirname, "./src/config"),
      "@common": path.resolve(__dirname, "./src/common"),
      "@middleware": path.resolve(__dirname, "./src/middleware"),
      "@database": path.resolve(__dirname, "./src/database"),
      "@modules": path.resolve(__dirname, "./src/modules"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@container": path.resolve(__dirname, "./src/container"),
      "@routes": path.resolve(__dirname, "./src/routes"),
      "@websocket": path.resolve(__dirname, "./src/websocket"),
      "@jobs": path.resolve(__dirname, "./src/jobs"),
      "@observability": path.resolve(__dirname, "./src/observability"),
    },
  },
});
