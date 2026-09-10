import { NavLink } from "react-router-dom";
import "./AvailabilityNav.css";

function navClass({
  isActive,
}: {
  isActive: boolean;
}) {
  return `availability-nav__link${
    isActive
      ? " availability-nav__link--active"
      : ""
  }`;
}

export function AvailabilityNav() {
  return (
    <nav
      className="availability-nav"
      aria-label="Secciones de disponibilidad"
    >
      <NavLink
        to="/app/availability"
        end
        className={navClass}
      >
        Consultar
      </NavLink>

      <NavLink
        to="/app/availability/rules"
        className={navClass}
      >
        Reglas
      </NavLink>
    </nav>
  );
}