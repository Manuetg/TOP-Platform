import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../context/BusinessContext";
import { getBusiness, updateBusiness } from "../api/business-profile";
import { isBusinessQuery } from "../context/business-query-scope";
import type { Business } from "../types/business.types";
import { ApiError } from "../../../shared/api/api-client";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import "../components/Business.css";
import { SubscriptionCard } from "../../subscription/components/SubscriptionCard";
import { PersonalProfile } from "../../profile/components/PersonalProfile";
import { BusinessBoundary } from "../components/BusinessBoundary";

const schema = z.object({
  name: z.string().trim().min(1, "Ingresa el nombre del establecimiento.").max(120, "Usa hasta 120 caracteres."),
  legalName: z.string(), taxId: z.string(),
  country: z.string().trim().max(120, "Usa hasta 120 caracteres."),
  region: z.string().trim().max(120, "Usa hasta 120 caracteres."),
  city: z.string().trim().max(120, "Usa hasta 120 caracteres."),
  address: z.string().trim().max(500, "Usa hasta 500 caracteres."),
  timezone: z.string().trim().min(1, "Ingresa la zona horaria.").refine((value) => { try { new Intl.DateTimeFormat("es", { timeZone: value }); return true; } catch { return false; } }, "Ingresa una zona horaria IANA válida, por ejemplo America/Asuncion."),
});
type Fields = z.infer<typeof schema>;
const fields = (business: Business): Fields => ({ name: business.name, legalName: business.legalName ?? "", taxId: business.taxId ?? "", timezone: business.timezone, country: business.country ?? "", region: business.region ?? "", city: business.city ?? "", address: business.address ?? "" });
const inaccessible = (error: unknown) => error instanceof ApiError && [403, 404].includes(error.status);

export function BusinessProfilePage() {
  const { activeBusinessId, activeRole, status: businessStatus } = useBusinessContext();
  const { session, updateUserProfile } = useAuth();
  const status = useRef<HTMLDivElement>(null);
  const query = useQuery({ queryKey: ["business-profile", session?.user.id, activeBusinessId], queryFn: ({ signal }) => getBusiness(activeBusinessId, session!.accessToken, signal), enabled: businessStatus === "ready" && Boolean(activeBusinessId && session), retry: false });
  return <section className="business-profile" aria-label="Perfil del establecimiento">
    <header><h1>Configuración</h1><p>Tu cuenta y la información del establecimiento activo.</p></header>
    <PersonalProfile onSaved={updateUserProfile} />
    <BusinessBoundary><div ref={status} tabIndex={-1} className="business-profile__message" aria-live="polite">
      {query.isPending ? "Cargando información…" : null}
      {query.isError ? <><p role="alert">{inaccessible(query.error) ? "No tienes acceso a este establecimiento o ya no está disponible." : "No pudimos actualizar la información del establecimiento."}</p><Button onClick={() => { status.current?.focus(); void query.refetch(); }}>Reintentar perfil</Button></> : null}
    </div>
    {query.data && !inaccessible(query.error) && session ? <BusinessProfileForm key={`${session.user.id}:${activeBusinessId}`} business={query.data} accessToken={session.accessToken} userId={session.user.id} canEdit={activeRole === "OWNER" || activeRole === "ADMIN"} onReload={async () => !(await query.refetch()).isError} /> : null}
    <SubscriptionCard /></BusinessBoundary>
  </section>;
}

function BusinessProfileForm({ business, accessToken, userId, canEdit, onReload }: { business: Business; accessToken: string; userId: string; canEdit: boolean; onReload: () => Promise<boolean> }) {
  const client = useQueryClient();
  const form = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: fields(business) });
  const version = useRef(business.updatedAt);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const message = useRef<HTMLDivElement>(null);
  const formElement = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [freshConflict, setFreshConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const mutation = useMutation({ retry: false, mutationFn: (values: Fields) => {
    controller.current = new AbortController();
    return updateBusiness(business.id, { ...values, legalName: values.legalName.trim() || null, taxId: values.taxId.trim() || null, country: values.country || null, region: values.region || null, city: values.city || null, address: values.address || null, expectedUpdatedAt: version.current }, accessToken, controller.current.signal);
  } });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked.current || !canEdit || blocked || conflict || !form.formState.isDirty) return;
    locked.current = true;
    setSaved(false);
    void form.handleSubmit(async (values) => {
      try {
        if (formElement.current?.contains(document.activeElement)) formElement.current.focus({ preventScroll: true });
        const updated = await mutation.mutateAsync(values);
        if (!alive.current || controller.current?.signal.aborted) return;
        await client.cancelQueries({ queryKey: ["business-profile", userId, business.id], exact: true });
        await client.cancelQueries({ queryKey: ["businesses", userId], exact: true });
        if (!alive.current || controller.current?.signal.aborted) return;
        client.setQueryData(["business-profile", userId, business.id], updated);
        client.setQueryData<Business[]>(["businesses", userId], (items) => items?.map((item) => item.id === updated.id ? updated : item));
        void client.invalidateQueries({ predicate: (item) => item.queryKey[0] !== "business-profile" && isBusinessQuery(item.queryKey, business.id) });
        form.reset(fields(updated)); version.current = updated.updatedAt; setSaved(true);
      } catch (error) {
        if (!alive.current || controller.current?.signal.aborted) return;
        if (inaccessible(error)) setBlocked(true);
        if (error instanceof ApiError && error.status === 409) { setConflict(true); setFreshConflict(false); }
      }
    })(event).finally(() => { locked.current = false; });
  };
  const pending = mutation.isPending || form.formState.isSubmitting;
  const dirty = form.formState.isDirty;
  useEffect(() => { if (!dirty && !pending && !conflict) { form.reset(fields(business)); version.current = business.updatedAt; } }, [business.name, business.legalName, business.taxId, business.timezone, business.country, business.region, business.city, business.address, business.updatedAt, dirty, pending, conflict, form.reset]);
  const reload = async () => {
    if (reloading) return;
    if (formElement.current?.contains(document.activeElement)) formElement.current.focus({ preventScroll: true });
    setReloading(true);
    const restored = await onReload();
    if (!alive.current) return;
    setReloading(false);
    if (restored) { setBlocked(false); if (conflict) setFreshConflict(true); else mutation.reset(); }
  };
  const discard = () => {
    const current = client.getQueryData<Business>(["business-profile", userId, business.id]) ?? business;
    form.reset(fields(current)); version.current = current.updatedAt;
    mutation.reset(); setConflict(false); setFreshConflict(false); setSaved(false);
  };
  return <form ref={formElement} tabIndex={-1} aria-label="Datos del establecimiento" className="business-profile__card top-surface" onSubmit={submit} noValidate>
    <h2>Tu establecimiento</h2>
    <p className="business-profile__notice">Establecimiento activo: {business.name}</p>
    <div ref={message} tabIndex={-1} className="business-profile__message" aria-live="polite">
      {saved && !dirty ? <p role="status">Cambios guardados.</p> : null}
      {mutation.isError ? <p role="alert">{blocked ? "Ya no tienes permiso para editar este establecimiento. Actualiza la información para revisar tu acceso." : conflict ? "La información del establecimiento cambió desde que empezaste a editar. Consulta los datos actuales antes de volver a guardar." : mutation.error.message}</p> : null}
    </div>
    {blocked ? <Button variant="secondary" loading={reloading} loadingLabel="Actualizando…" onClick={() => { void reload(); }}>Actualizar establecimiento</Button> : null}
    {!blocked ? <><div className="business-profile__grid">
      <Input id="business-name" label="Nombre del establecimiento" {...form.register("name")} error={form.formState.errors.name?.message} readOnly={!canEdit} disabled={pending} autoComplete="organization" required />
      <Input id="business-legal" label="Razón social (opcional)" {...form.register("legalName")} readOnly={!canEdit} disabled={pending} />
      <Input id="business-tax" label="Identificación fiscal (opcional)" {...form.register("taxId")} readOnly={!canEdit} disabled={pending} />
      <Input id="business-timezone" label="Zona horaria" {...form.register("timezone")} error={form.formState.errors.timezone?.message} readOnly={!canEdit} disabled={pending} />
      <Input id="business-currency" label="Moneda" value={business.currency} readOnly />
    </div>
    <fieldset className="business-profile__location" disabled={pending}>
      <legend>Ubicación</legend>
      <div className="business-profile__grid">
        <Input id="business-country" label="País (opcional)" {...form.register("country")} error={form.formState.errors.country?.message} readOnly={!canEdit} autoComplete="country-name" />
        <Input id="business-region" label="Departamento o estado (opcional)" {...form.register("region")} error={form.formState.errors.region?.message} readOnly={!canEdit} autoComplete="address-level1" />
        <Input id="business-city" label="Ciudad (opcional)" {...form.register("city")} error={form.formState.errors.city?.message} readOnly={!canEdit} autoComplete="address-level2" />
        <Input id="business-address" label="Dirección (opcional)" {...form.register("address")} error={form.formState.errors.address?.message} readOnly={!canEdit} autoComplete="street-address" />
      </div>
    </fieldset>
    <p className="business-profile__notice">La zona horaria solo puede cambiarse si no hay recursos, reservas, bloqueos ni pagos registrados, incluidos los archivados o cancelados. Si el cambio se rechaza, conserva la zona horaria vigente para guardar los demás datos. PYG es la única moneda del MVP.</p>
    {canEdit ? <div className="business-profile__actions"><Button type="submit" loading={pending} loadingLabel="Guardando…" disabled={!dirty || conflict}>Guardar cambios</Button>{conflict ? <Button type="button" variant="secondary" loading={reloading} loadingLabel="Actualizando." onClick={() => { void reload(); }}>Consultar establecimiento actual</Button> : null}<Button type="button" variant="secondary" disabled={pending || reloading || (conflict ? !freshConflict : !dirty)} onClick={discard}>Descartar cambios</Button></div> : <p className="business-profile__notice">Tu rol permite consultar este perfil. Solo propietarios y administradores pueden editarlo.</p>}</> : null}
    {!blocked && conflict && freshConflict ? <div className="business-profile__current" role="region" aria-label="Establecimiento actual consultado">
      <p className="business-profile__notice">Establecimiento consultado. Usa «Descartar cambios» para comenzar de nuevo con estos datos.</p>
      <dl><div><dt>Nombre del establecimiento</dt><dd>{business.name}</dd></div><div><dt>Razón social</dt><dd>{business.legalName ?? "Sin registrar"}</dd></div><div><dt>Identificación fiscal</dt><dd>{business.taxId ?? "Sin registrar"}</dd></div><div><dt>Zona horaria</dt><dd>{business.timezone}</dd></div><div><dt>País</dt><dd>{business.country ?? "Sin registrar"}</dd></div><div><dt>Departamento o estado</dt><dd>{business.region ?? "Sin registrar"}</dd></div><div><dt>Ciudad</dt><dd>{business.city ?? "Sin registrar"}</dd></div><div><dt>Dirección</dt><dd>{business.address ?? "Sin registrar"}</dd></div></dl>
    </div> : null}
  </form>;
}
