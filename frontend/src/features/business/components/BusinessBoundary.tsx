import type { PropsWithChildren } from "react";
import { Button } from "../../../shared/ui/Button";
import { useBusinessContext } from "../context/BusinessContext";

export function BusinessBoundary({ children }: PropsWithChildren) {
  const { status, retry } = useBusinessContext();
  if (status === "ready") return <>{children}</>;
  if (status === "loading") return <main className="business-boundary" aria-live="polite">Cargando negocio...</main>;
  if (status === "selection-required") return <main className="business-boundary">Seleccioná un negocio para continuar.</main>;
  if (status === "empty") return <main className="business-boundary">No tenés un negocio activo disponible.</main>;
  return <main className="business-boundary"><p>No pudimos cargar tus negocios.</p><Button type="button" onClick={retry}>Reintentar</Button></main>;
}
