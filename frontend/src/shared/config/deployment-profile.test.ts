import { describe, expect, it } from "vitest";
import { resolveDeploymentConfig } from "./deployment-profile";

describe("perfil de despliegue", () => {
  it("conserva la configuración estándar y su API por defecto", () => {
    expect(resolveDeploymentConfig({})).toEqual({ profile: "standard", apiUrl: "http://localhost:3000/api" });
    expect(resolveDeploymentConfig({ VITE_API_URL: "https://api.top.example/api" })).toEqual({
      profile: "standard", apiUrl: "https://api.top.example/api",
    });
  });

  it.each([undefined, "/api"])("usa mismo origen para el piloto con API %s", (apiUrl) => {
    expect(resolveDeploymentConfig({ VITE_DEPLOYMENT_PROFILE: "lan-pilot", VITE_API_URL: apiUrl })).toEqual({
      profile: "lan-pilot", apiUrl: "/api",
    });
  });

  it.each(["", "http://localhost:3000/api", "https://api.top.example/api", "//example.test/api", "/api/"])(
    "rechaza una base ajena o ambigua en piloto: %s", (apiUrl) => {
      expect(() => resolveDeploymentConfig({ VITE_DEPLOYMENT_PROFILE: "lan-pilot", VITE_API_URL: apiUrl }))
        .toThrow("VITE_API_URL debe ser /api");
    },
  );

  it.each(["", "pilot", "LAN-PILOT"])("rechaza un perfil desconocido: %s", (profile) => {
    expect(() => resolveDeploymentConfig({ VITE_DEPLOYMENT_PROFILE: profile })).toThrow("VITE_DEPLOYMENT_PROFILE");
  });
});
