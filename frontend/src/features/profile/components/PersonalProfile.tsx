import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../../auth/context/AuthContext";
import { ApiError } from "../../../shared/api/api-client";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import { updateUserProfile, type UserProfile } from "../api/user-profile";
import { useUserProfile, userProfileKey } from "../queries/use-user-profile";
import "./PersonalProfile.css";

const schema = z.object({ displayName: z.string().trim().min(1, "Ingresa tu nombre.").max(120, "Usa hasta 120 caracteres."), reason: z.string().trim().min(1, "Ingresa el motivo del cambio.") });
type Fields = z.infer<typeof schema>;
const fields = (profile: UserProfile): Fields => ({ displayName: profile.displayName ?? "", reason: "" });
const inaccessible = (error: unknown) => error instanceof ApiError && [403, 404].includes(error.status);

export function PersonalProfile({ onSaved }: { onSaved?: (profile: UserProfile) => boolean | void }) {
  const { session } = useAuth();
  const query = useUserProfile();
  const heading = useRef<HTMLHeadingElement>(null);
  if (!session) return null;
  return <section className="personal-profile top-surface" aria-labelledby="personal-profile-title">
    <header><h2 id="personal-profile-title" ref={heading} tabIndex={-1}>Tu cuenta</h2><p>Tu identidad es la misma en todos tus establecimientos.</p></header>
    {query.isPending ? <p role="status">Cargando tu perfil.</p> : null}
    {query.isError ? <div><p role="alert">{inaccessible(query.error) ? "No tienes acceso a este perfil o ya no está disponible." : "No pudimos actualizar tu perfil. Revisa tu conexión e intenta de nuevo."}</p><Button variant="secondary" onClick={() => { heading.current?.focus({ preventScroll: true }); void query.refetch(); }}>Reintentar cuenta</Button></div> : null}
    {query.data && !inaccessible(query.error) ? <ProfileForm key={session.user.id} profile={query.data} accessToken={session.accessToken} onSaved={onSaved} onReload={async () => !(await query.refetch()).isError} /> : null}
  </section>;
}

function ProfileForm({ profile, accessToken, onSaved, onReload }: { profile: UserProfile; accessToken: string; onSaved?: (profile: UserProfile) => boolean | void; onReload: () => Promise<boolean> }) {
  const client = useQueryClient();
  const form = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: fields(profile) });
  const { isDirty, isSubmitting } = form.formState;
  const version = useRef(profile.updatedAt);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const element = useRef<HTMLFormElement>(null);
  const [saved, setSaved] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [freshConflict, setFreshConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const mutation = useMutation({ retry: false, mutationFn: (values: Fields) => {
    controller.current = new AbortController();
    return updateUserProfile(profile.id, { ...values, expectedUpdatedAt: version.current }, accessToken, controller.current.signal);
  } });
  const pending = mutation.isPending || isSubmitting;
  useEffect(() => { if (!isDirty && !pending && !conflict) { form.reset(fields(profile)); version.current = profile.updatedAt; } }, [profile.displayName, profile.updatedAt, isDirty, pending, conflict, form.reset]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked.current || blocked || conflict || !isDirty) return;
    const acceptSavedProfile = onSaved;
    locked.current = true; setSaved(false);
    void form.handleSubmit(async (values) => {
      try {
        if (element.current?.contains(document.activeElement)) element.current.focus({ preventScroll: true });
        const updated = await mutation.mutateAsync(values);
        if (!alive.current || controller.current?.signal.aborted) return;
        await client.cancelQueries({ queryKey: userProfileKey(profile.id), exact: true });
        if (!alive.current || controller.current?.signal.aborted) return;
        if (acceptSavedProfile?.(updated) === false) return;
        client.setQueryData(userProfileKey(profile.id), updated);
        form.reset(fields(updated)); version.current = updated.updatedAt;
        setSaved(true);
      } catch (error) {
        if (alive.current && !controller.current?.signal.aborted) {
          if (inaccessible(error)) setBlocked(true);
          if (error instanceof ApiError && error.status === 409) { setConflict(true); setFreshConflict(false); }
        }
      }
    })(event).finally(() => { locked.current = false; });
  };
  const reload = async () => {
    if (reloading) return;
    if (element.current?.contains(document.activeElement)) element.current.focus({ preventScroll: true });
    setReloading(true);
    const restored = await onReload();
    if (!alive.current) return;
    setReloading(false);
    if (restored) { setBlocked(false); if (conflict) setFreshConflict(true); else mutation.reset(); }
  };
  const discard = () => {
    const current = client.getQueryData<UserProfile>(userProfileKey(profile.id)) ?? profile;
    form.reset(fields(current)); version.current = current.updatedAt;
    mutation.reset(); setConflict(false); setFreshConflict(false); setSaved(false);
  };
  return <form ref={element} tabIndex={-1} aria-label="Datos de tu cuenta" className="personal-profile__form" onSubmit={submit} noValidate>
    <div aria-live="polite">{saved && !isDirty ? <p role="status">Tu nombre se guardó.</p> : null}{mutation.isError ? <p role="alert">{blocked ? "No puedes editar este perfil. Actualiza la información para revisar tu acceso." : conflict ? "Tu perfil cambió desde que empezaste a editar. Consulta los datos actuales antes de volver a guardar." : mutation.error.message}</p> : null}</div>
    {blocked ? <Button variant="secondary" loading={reloading} loadingLabel="Actualizando." onClick={() => { void reload(); }}>Actualizar cuenta</Button> : <>
      <Input id="personal-display-name" label="Nombre completo" autoComplete="name" required maxLength={120} {...form.register("displayName")} error={form.formState.errors.displayName?.message} disabled={pending} />
      <Input id="personal-name-reason" label="Motivo del cambio" required {...form.register("reason")} error={form.formState.errors.reason?.message} disabled={pending} />
      <div className="personal-profile__email"><span>Correo electrónico</span><p>{profile.email}</p><p className="personal-profile__help">Este correo se usa para iniciar sesión. Su cambio todavía no está disponible: requiere un proceso seguro de verificación.</p></div>
      <div className="personal-profile__actions"><Button type="submit" disabled={!isDirty || conflict} loading={pending} loadingLabel="Guardando nombre.">Guardar nombre</Button>{conflict ? <Button type="button" variant="secondary" loading={reloading} loadingLabel="Actualizando." onClick={() => { void reload(); }}>Consultar nombre actual</Button> : null}<Button type="button" variant="secondary" disabled={pending || !isDirty || reloading || (conflict && !freshConflict)} onClick={discard}>Descartar nombre</Button></div>
      {conflict && freshConflict ? <p className="personal-profile__help">Nombre consultado: {profile.displayName ?? "Sin nombre registrado"}. Usa «Descartar nombre» para comenzar de nuevo con estos datos.</p> : null}
    </>}
  </form>;
}
