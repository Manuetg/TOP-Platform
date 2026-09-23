import { Check, Building2 } from "lucide-react";
import { useBusinessContext } from "../context/BusinessContext";
import { Button } from "../../../shared/ui/Button";
import "./Business.css";

export function BusinessSelector({ onSelected }: { onSelected?: () => void }) {
  const { businesses, activeBusinessId, status, retry, selectBusiness } = useBusinessContext();
  if (status === "loading") return <p role="status">Cargando establecimientos…</p>;
  if (status === "error") return <div><p role="alert">No pudimos cargar tus establecimientos.</p><Button onClick={retry}>Reintentar negocios</Button></div>;
  if (status === "empty") return <p>No tenés un establecimiento activo disponible.</p>;
  if (businesses.length === 1 && activeBusinessId) return <p className="business-single"><Building2 aria-hidden="true" size={20} />{businesses[0].name}<span>Negocio activo</span></p>;
  return <div className="business-selector" aria-label="Establecimientos disponibles">{businesses.map((business) => <button key={business.id} type="button" aria-pressed={business.id === activeBusinessId} onClick={() => { if (selectBusiness(business.id)) onSelected?.(); }}><span>{business.name}</span>{business.id === activeBusinessId ? <Check size={18} aria-hidden="true" /> : null}</button>)}</div>;
}
