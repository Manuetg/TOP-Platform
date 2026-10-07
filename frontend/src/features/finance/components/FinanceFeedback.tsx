import { CircleAlert, LockKeyhole } from "lucide-react";
import { ApiError } from "../../../shared/api/api-client";
import { Button } from "../../../shared/ui/Button";

export function financeErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return "Tu sesión venció. Vuelve a ingresar y verifica el registro antes de continuar.";
  if (error instanceof ApiError && error.status === 403) return "No tienes permiso para consultar o registrar Finanzas en este negocio.";
  if (error instanceof ApiError && error.status === 409) return "La información cambió. Actualiza el reporte y revisa tu borrador antes de volver a registrar.";
  return error instanceof Error ? error.message : "No pudimos completar la solicitud.";
}
export function FinanceError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  const message = error instanceof ApiError && error.status === 409 ? error.message : financeErrorMessage(error);
  return <div className="finance-state finance-state--error" role="alert">
    {forbidden ? <LockKeyhole size={24} aria-hidden="true" /> : <CircleAlert size={24} aria-hidden="true" />}
    <p>{message}</p>
    {onRetry && !forbidden ? <Button variant="secondary" onClick={onRetry}>Volver a cargar</Button> : null}
  </div>;
}
