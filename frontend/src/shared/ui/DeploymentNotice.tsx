import { TriangleAlert } from "lucide-react";
import { deploymentConfig } from "../config/deployment";
import "./DeploymentNotice.css";

export function DeploymentNotice() {
  if (deploymentConfig.profile !== "lan-pilot") return null;

  return <aside className="top-deployment-notice" aria-label="Limitaciones del piloto">
    <TriangleAlert size={20} aria-hidden="true" />
    <div>
      <strong>Piloto en red local</strong>
      <p>Esta conexión HTTP no está cifrada. Las contraseñas y los datos pueden ser leídos por terceros en la red. Úsala solo en la Wi-Fi privada del piloto.</p>
      <p>El correo está deshabilitado: usa tu cuenta ya verificada. El registro, la recuperación de contraseña y el cambio de correo no están disponibles.</p>
    </div>
  </aside>;
}
