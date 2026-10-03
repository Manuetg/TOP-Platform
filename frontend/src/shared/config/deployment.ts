import { resolveDeploymentConfig } from "./deployment-profile";

export const deploymentConfig = resolveDeploymentConfig({
  VITE_DEPLOYMENT_PROFILE: import.meta.env.VITE_DEPLOYMENT_PROFILE,
  VITE_API_URL: import.meta.env.VITE_API_URL,
});

export const EMAIL_UNAVAILABLE_MESSAGE =
  "El correo no está disponible en este piloto. Usa una cuenta existente y verificada.";
