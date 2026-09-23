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

const schema = z.object({
  name: z.string().trim().min(1, "Ingresá el nombre del establecimiento.").max(120, "Usá hasta 120 caracteres."),
  legalName: z.string(), taxId: z.string(),
  timezone: z.string().trim().min(1, "Ingresá la zona horaria.").refine((value) => { try { new Intl.DateTimeFormat("es", { timeZone: value }); return true; } catch { return false; } }, "Ingresá una zona horaria IANA válida, por ejemplo America/Asuncion."),
});
type Fields = z.infer<typeof schema>;
const fields = (business: Business): Fields => ({ name: business.name, legalName: business.legalName ?? "", taxId: business.taxId ?? "", timezone: business.timezone });
const inaccessible = (error: unknown) => error instanceof ApiError && [403, 404].includes(error.status);

export function BusinessProfilePage() {
  const { activeBusinessId, activeRole } = useBusinessContext();
  const { session } = useAuth();
  const status = useRef<HTMLDivElement>(null);
  const query = useQuery({ queryKey: ["business-profile", session?.user.id, activeBusinessId], queryFn: ({ signal }) => getBusiness(activeBusinessId, session!.accessToken, signal), enabled: Boolean(activeBusinessId && session), retry: false });
  return <section className="business-profile" aria-label="Perfil del establecimiento">
    <header><h1>Tu establecimiento</h1><p>Información operativa del negocio activo.</p></header>
    <div ref={status} tabIndex={-1} className="business-profile__message" aria-live="polite">
      {query.isPending ? "Cargando información…" : null}
      {query.isError ? <><p role="alert">{inaccessible(query.error) ? "No tenés acceso a este establecimiento o ya no está disponible." : "No pudimos actualizar la información del establecimiento."}</p><Button onClick={() => { status.current?.focus(); void query.refetch(); }}>Reintentar perfil</Button></> : null}
    </div>
    {query.data && !inaccessible(query.error) && session ? <BusinessProfileForm key={`${session.user.id}:${activeBusinessId}`} business={query.data} accessToken={session.accessToken} userId={session.user.id} canEdit={activeRole === "OWNER" || activeRole === "ADMIN"} /> : null}
    <SubscriptionCard />
  </section>;
}

function BusinessProfileForm({ business, accessToken, userId, canEdit }: { business: Business; accessToken: string; userId: string; canEdit: boolean }) {
  const client = useQueryClient();
  const form = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: fields(business) });
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const message = useRef<HTMLDivElement>(null);
  const formElement = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const mutation = useMutation({ retry: false, mutationFn: (values: Fields) => {
    controller.current = new AbortController();
    return updateBusiness(business.id, { ...values, legalName: values.legalName.trim() || null, taxId: values.taxId.trim() || null }, accessToken, controller.current.signal);
  } });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked.current || !canEdit || blocked) return;
    locked.current = true;
    setSaved(false);
    void form.handleSubmit(async (values) => {
      try {
        if (formElement.current?.contains(document.activeElement)) formElement.current.focus({ preventScroll: true });
        const updated = await mutation.mutateAsync(values);
        if (!alive.current || controller.current?.signal.aborted) return;
        client.setQueryData(["business-profile", userId, business.id], updated);
        client.setQueryData<Business[]>(["businesses", userId], (items) => items?.map((item) => item.id === updated.id ? updated : item));
        void client.invalidateQueries({ predicate: (item) => item.queryKey[0] !== "business-profile" && isBusinessQuery(item.queryKey, business.id) });
        form.reset(fields(updated)); setSaved(true);
      } catch (error) {
        if (!alive.current || controller.current?.signal.aborted) return;
        if (inaccessible(error)) setBlocked(true);
      }
    })(event).finally(() => { locked.current = false; });
  };
  const pending = mutation.isPending || form.formState.isSubmitting;
  return <form ref={formElement} tabIndex={-1} aria-label="Datos del establecimiento" className="business-profile__card top-surface" onSubmit={submit} noValidate>
    <div ref={message} tabIndex={-1} className="business-profile__message" aria-live="polite">
      {saved ? <p role="status">Cambios guardados.</p> : null}
      {mutation.isError ? <p role="alert">{blocked ? "Ya no tenés permiso para editar este establecimiento. Volvé a cargar el perfil." : mutation.error.message}</p> : null}
    </div>
    {!blocked ? <><div className="business-profile__grid">
      <Input id="business-name" label="Nombre del establecimiento" {...form.register("name")} error={form.formState.errors.name?.message} readOnly={!canEdit} disabled={pending} autoComplete="organization" />
      <Input id="business-legal" label="Razón social (opcional)" {...form.register("legalName")} readOnly={!canEdit} disabled={pending} />
      <Input id="business-tax" label="Identificación fiscal (opcional)" {...form.register("taxId")} readOnly={!canEdit} disabled={pending} />
      <Input id="business-timezone" label="Zona horaria" {...form.register("timezone")} error={form.formState.errors.timezone?.message} readOnly={!canEdit} disabled={pending} />
      <Input id="business-currency" label="Moneda" value={business.currency} readOnly />
    </div>
    <p className="business-profile__notice">La zona horaria se usa para interpretar fechas y horarios del establecimiento. La moneda contractual es PYG.</p>
    {canEdit ? <div className="business-profile__actions"><Button type="submit" loading={pending} loadingLabel="Guardando…" disabled={!form.formState.isDirty}>Guardar cambios</Button><Button type="button" variant="secondary" disabled={pending || !form.formState.isDirty} onClick={() => { form.reset(fields(business)); mutation.reset(); setSaved(false); }}>Descartar cambios</Button></div> : <p className="business-profile__notice">Tu rol permite consultar este perfil. Solo propietarios y administradores pueden editarlo.</p>}</> : null}
  </form>;
}
