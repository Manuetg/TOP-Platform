import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { ApiError } from "../../../shared/api/api-client";
import { Button } from "../../../shared/ui/Button";
import { requestUpgrade, type Subscription } from "../api/subscription";
import { useSubscription } from "../queries/use-subscription";
import "./Subscription.css";

export function SubscriptionCard() {
  const { session } = useAuth(); const { activeBusinessId } = useBusinessContext();
  if (!session || !activeBusinessId) return null;
  return <SubscriptionContent key={`${session.user.id}:${activeBusinessId}`} />;
}
function SubscriptionContent() {
  const query = useSubscription(); const { session } = useAuth(); const { activeBusinessId, activeRole } = useBusinessContext();
  const client = useQueryClient(); const heading = useRef<HTMLHeadingElement>(null); const controller = useRef<AbortController | null>(null); const alive = useRef(true); const locked = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const mutation = useMutation({ retry: false, mutationFn: () => { controller.current = new AbortController(); return requestUpgrade(activeBusinessId, session!.accessToken, controller.current.signal); } });
  const inaccessible = query.error instanceof ApiError && [403, 404].includes(query.error.status);
  const data = inaccessible ? undefined : query.data;
  const requestDenied = mutation.error instanceof ApiError && [403, 404].includes(mutation.error.status);
  const canRequest = !requestDenied && activeRole === "OWNER";
  const requested = confirmed || data?.upgrade.status === "REQUESTED";
  const submit = async () => {
    if (locked.current || requested || !canRequest) return;
    locked.current = true; heading.current?.focus({ preventScroll: true });
    try {
      const upgrade = await mutation.mutateAsync();
      if (!alive.current || controller.current?.signal.aborted) return;
      setConfirmed(true);
      client.setQueryData<Subscription>(["subscription", session!.user.id, activeBusinessId], (current) => current ? { ...current, upgrade } : current);
    } catch { /* Error stays local; a retry asks for the same unique request. */ }
    finally { locked.current = false; }
  };
  return <section className={`subscription-card top-surface subscription-card--${data?.usage.resources.state.toLowerCase() ?? "normal"}`} aria-label="Plan y capacidad">
    <header><span className="subscription-card__eyebrow">Plan y capacidad</span><h2 ref={heading} tabIndex={-1}>{data?.subscription.planName ?? "Tu plan"}</h2></header>
    {query.isPending ? <p role="status">Cargando plan y uso…</p> : null}
    {query.isError ? <div><p role="alert">{inaccessible ? "No tenés acceso al plan de este establecimiento." : "No pudimos actualizar el plan y su uso. Reintentá antes de crear un recurso."}</p><Button variant="secondary" onClick={() => { heading.current?.focus({ preventScroll: true }); void query.refetch(); }}>Reintentar plan</Button></div> : null}
    {data ? <><div className="subscription-card__usage"><span>Recursos operativos</span><strong>{data.usage.resources.used} / {data.entitlements.maxResources}</strong></div>
      <progress aria-label="Uso de recursos" value={Math.min(data.usage.resources.percentage, 100)} max={100} />
      <p>{data.usage.resources.available} disponibles · {data.usage.resources.percentage}% de utilización</p>
      <p className="subscription-card__notice">{data.usage.resources.state === "LIMIT" ? "Límite alcanzado. Los recursos existentes siguen disponibles; solicitá una ampliación para agregar más." : data.usage.resources.state === "WARNING" ? "Te estás acercando al límite de tu plan." : "Tenés capacidad para seguir configurando tu establecimiento."}</p>
      <p className="subscription-card__help">Incluye activos y fuera de servicio. Los archivados no consumen cupo.</p>
      {requested ? <p role="status">Solicitud de ampliación registrada. El plan y el cupo se mantienen hasta su revisión.</p> : canRequest ? <Button variant="secondary" loading={mutation.isPending} loadingLabel="Registrando solicitud…" onClick={() => { void submit(); }}>Solicitar ampliación</Button> : <p className="subscription-card__help">El propietario puede solicitar una ampliación.</p>}
      {mutation.isError && !requested ? <p role="alert">{requestDenied ? "Ya no tenés acceso para solicitar una ampliación. Volvé a seleccionar el establecimiento para actualizar tus permisos." : `${mutation.error.message} Podés reintentar; se conserva una única solicitud por establecimiento.`}</p> : null}
    </> : null}
  </section>;
}
