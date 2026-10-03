export type DeploymentProfile = "standard" | "lan-pilot";

interface DeploymentEnvironment {
  VITE_DEPLOYMENT_PROFILE?: string;
  VITE_API_URL?: string;
}

export function resolveDeploymentConfig(environment: DeploymentEnvironment) {
  const profile = environment.VITE_DEPLOYMENT_PROFILE ?? "standard";
  if (profile !== "standard" && profile !== "lan-pilot") {
    throw new Error("VITE_DEPLOYMENT_PROFILE debe ser standard o lan-pilot.");
  }

  if (profile === "lan-pilot") {
    if (environment.VITE_API_URL !== undefined && environment.VITE_API_URL !== "/api") {
      throw new Error("VITE_API_URL debe ser /api para el piloto LAN.");
    }
    return Object.freeze({ profile, apiUrl: "/api" });
  }

  return Object.freeze({
    profile,
    apiUrl: environment.VITE_API_URL ?? "http://localhost:3000/api",
  });
}
