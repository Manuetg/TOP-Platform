import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolveDeploymentConfig } from "./src/shared/config/deployment-profile.ts";

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    resolveDeploymentConfig(loadEnv(mode, process.cwd(), "VITE_"));
  }
  return {
    plugins: [react()],
    server: {
      port: 3001,
    },
    test: {
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
      globals: true,
    },
  };
});
