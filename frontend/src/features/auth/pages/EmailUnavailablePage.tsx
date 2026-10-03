import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { EMAIL_UNAVAILABLE_MESSAGE } from "../../../shared/config/deployment";
import { AuthPageShell } from "../components/AuthPageShell";

export function EmailUnavailablePage() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.search || location.hash) {
      void navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.search, location.hash, navigate]);

  return <AuthPageShell labelledBy="email-unavailable-title">
    <header className="top-auth-header">
      <h1 id="email-unavailable-title" className="top-auth-title">Correo no disponible</h1>
      <p className="top-auth-description">{EMAIL_UNAVAILABLE_MESSAGE}</p>
    </header>
    <p className="top-auth-description">El registro, la verificación de correo, la recuperación de contraseña y el cambio de correo están deshabilitados en este piloto.</p>
    <p className="top-auth-description">Si no puedes acceder, contacta a la persona que administra el piloto.</p>
    <p className="top-auth-footnote"><Link className="top-auth-forgot" to="/login">Volver al inicio de sesión</Link></p>
  </AuthPageShell>;
}
