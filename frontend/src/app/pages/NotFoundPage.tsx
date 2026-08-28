import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="top-not-found-page">
      <section
        className="top-not-found-layout"
        aria-labelledby="not-found-title"
      >
        <div className="top-not-found-code" aria-hidden="true">
          404
        </div>

        <div className="top-not-found-content">
          <h1 id="not-found-title" className="top-not-found-title">
            Página no encontrada
          </h1>

          <p className="top-not-found-description">
            La dirección que ingresaste no existe o ya no está disponible.
          </p>

          <Link
            className="top-button top-button--primary top-not-found-action"
            to="/login"
          >
            Volver al inicio de sesión
          </Link>
        </div>
      </section>
    </main>
  );
}
