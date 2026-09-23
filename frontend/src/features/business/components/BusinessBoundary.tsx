import type { PropsWithChildren } from "react";
import { Button } from "../../../shared/ui/Button";
import { useBusinessContext } from "../context/BusinessContext";
import { BusinessSelector } from "./BusinessSelector";

export function BusinessBoundary({ children }: PropsWithChildren) {
  const { status, retry } = useBusinessContext();
  if (status === "ready") return <>{children}</>;
  if (status === "loading") return <main className="business-boundary" aria-live="polite">Cargando negocio...</main>;
  if (status === "selection-required") return <section className="business-selection-page"><h1>Seleccioná un negocio para continuar.</h1><BusinessSelector onSelected={() => document.getElementById("top-main-content")?.focus({ preventScroll: true })} /></section>;
  if (status === "empty") return <main className="business-boundary">No tenés un negocio activo disponible.</main>;
  return <main className="business-boundary"><p>No pudimos cargar tus negocios.</p><Button type="button" onClick={retry}>Reintentar</Button></main>;
}
