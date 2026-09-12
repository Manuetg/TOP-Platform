import { useState } from "react";
import { ArrowRight, House, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import type {
  Resource,
  ResourceImageCover,
} from "../../resources/types/resource.types";
import type { RatePlan } from "../../pricing/types/rate-plan.types";
import { revenueLabel } from "./DashboardMetrics";

export function PanelError({
  name,
  onRetry,
}: {
  name: string;
  onRetry: () => void;
}) {
  return (
    <div className="dashboard-panel-state" role="alert">
      <p>No pudimos cargar {name}.</p>
      <Button variant="secondary" onClick={onRetry}>
        Reintentar {name}
      </Button>
    </div>
  );
}

export function CatalogSkeleton({ name }: { name: string }) {
  return (
    <div
      className="dashboard-catalog-skeleton"
      role="status"
      aria-label={`Cargando ${name}`}
    >
      <span />
      <span />
      <span />
    </div>
  );
}

function ResourceCover({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="dashboard-resource-cover">
      {url && !failed ? (
        <img src={url} alt="" onError={() => setFailed(true)} />
      ) : (
        <House size={22} strokeWidth={1.5} aria-hidden="true" />
      )}
    </span>
  );
}

const resourceStatusLabels = {
  ACTIVE: "Activo",
  OUT_OF_SERVICE: "Fuera de servicio",
  ARCHIVED: "Archivado",
};
export function ResourcesPreview({
  resources,
  covers,
  loading,
  error,
  onRetry,
}: {
  resources?: Resource[];
  covers?: ResourceImageCover[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const coverMap = new Map(
    covers?.map((cover) => [cover.resourceId, cover.url]),
  );
  return (
    <section
      className="dashboard-card dashboard-catalog dashboard-resources"
      aria-labelledby="dashboard-resources-title"
      data-source="REAL"
    >
      <header>
        <h2 id="dashboard-resources-title">Recursos</h2>
        <Link to="/app/resources">
          Ver todos los recursos <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>
      {error ? (
        <PanelError name="recursos" onRetry={onRetry} />
      ) : loading || !resources ? (
        <CatalogSkeleton name="recursos" />
      ) : resources.length === 0 ? (
        <div className="dashboard-panel-state">
          <p>Todavía no hay recursos.</p>
          <Link to="/app/resources/new">Crear recurso</Link>
        </div>
      ) : (
        <table>
          <caption className="dashboard-sr-only">
            Vista previa de hasta cuatro recursos del negocio
          </caption>
          <thead>
            <tr>
              <th scope="col">Recurso</th>
              <th scope="col">Código</th>
              <th scope="col">Capacidad</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {resources.slice(0, 4).map((resource) => (
              <tr key={resource.id}>
                <td>
                  <Link
                    className="dashboard-resource-link"
                    to={`/app/resources/${resource.id}`}
                  >
                    <ResourceCover
                      key={coverMap.get(resource.id)}
                      url={coverMap.get(resource.id)}
                    />
                    <span>
                      <strong>{resource.name}</strong>
                      <small>
                        {resource.description || resource.internalCode}
                      </small>
                    </span>
                  </Link>
                </td>
                <td data-label="Código">{resource.internalCode}</td>
                <td data-label="Capacidad">
                  <span className="dashboard-capacity">
                    <Users size={15} aria-hidden="true" />
                    {resource.capacityMaximum}
                  </span>
                </td>
                <td data-label="Estado">
                  <span
                    className={`dashboard-badge dashboard-badge--${resource.status}`}
                  >
                    {resourceStatusLabels[resource.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function PricingPreview({
  plans,
  loading,
  error,
  onRetry,
}: {
  plans?: RatePlan[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      className="dashboard-card dashboard-catalog dashboard-pricing"
      aria-labelledby="dashboard-pricing-title"
      data-source="REAL"
    >
      <header>
        <h2 id="dashboard-pricing-title">Precios</h2>
        <Link to="/app/pricing">
          Ver todas las tarifas <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>
      {error ? (
        <PanelError name="tarifas" onRetry={onRetry} />
      ) : loading || !plans ? (
        <CatalogSkeleton name="tarifas" />
      ) : plans.length === 0 ? (
        <div className="dashboard-panel-state">
          <p>Todavía no hay tarifas configuradas.</p>
        </div>
      ) : (
        <table>
          <caption className="dashboard-sr-only">
            Vista previa de hasta tres tarifas del negocio
          </caption>
          <thead>
            <tr>
              <th scope="col">Tarifa</th>
              <th scope="col">Precio por noche</th>
              <th scope="col">Vigencia</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {plans.slice(0, 3).map((plan) => (
              <tr key={plan.id}>
                <th scope="row">
                  <strong>{plan.name}</strong>
                  <small>{plan.description || "Sin descripción"}</small>
                </th>
                <td data-label="Precio por noche" className="dashboard-price">
                  {revenueLabel({
                    currency: plan.currency,
                    amountMinor: plan.baseNightlyAmountMinor,
                  })}
                </td>
                <td data-label="Vigencia">
                  {!plan.validFrom && !plan.validTo
                    ? "Sin límite de vigencia"
                    : `${plan.validFrom ?? "Sin inicio"} → ${plan.validTo ?? "Sin fin"}`}
                </td>
                <td data-label="Estado">
                  <span
                    className={`dashboard-badge dashboard-badge--${plan.status}`}
                  >
                    {plan.status === "ACTIVE" ? "Activa" : "Archivada"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
