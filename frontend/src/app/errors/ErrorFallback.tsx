import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../shared/ui/Button";
import "./ErrorFallback.css";

export function ErrorFallback({ retry, general = false }: { retry?: () => void; general?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  const content = (
    <section className="top-error-fallback" aria-labelledby="application-error-title">
      <div role="alert">
        <h1 id="application-error-title" ref={heading} tabIndex={-1}>
          {general ? "La aplicación encontró un problema." : "No pudimos mostrar esta pantalla."}
        </h1>
        <p>{general ? "Puedes volver al inicio o recargar la aplicación para continuar." : "Intenta mostrarla de nuevo o continúa desde el inicio."}</p>
      </div>
      <div className="top-error-fallback__actions">
        {retry && <Button type="button" onClick={retry}>Reintentar</Button>}
        {general ? (
          <a className="top-button top-button--primary" href="/app">Ir al inicio</a>
        ) : (
          <Link className="top-button top-button--secondary" to="/app">Ir al inicio</Link>
        )}
        {general && <Button type="button" variant="secondary" onClick={() => window.location.reload()}>Recargar aplicación</Button>}
      </div>
    </section>
  );
  return general ? <main className="top-error-page">{content}</main> : content;
}
