import { defineConfig } from "@playwright/test";

// Muestra visual acotada. Transporte sintético, sin servicios del operador.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "fernly-visual.e2e.ts",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: process.env.TOP_FERNLY_QA_OUTPUT ?? "./test-results/fernly",
  reporter: "list",
  use: { channel: "msedge", headless: true, reducedMotion: "reduce", locale: "es-PY", timezoneId: "America/Asuncion" },
});
