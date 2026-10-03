import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Leaf, Mountain, Sun, UserRound } from "lucide-react";
import { useAuth } from "../../auth/context/AuthContext";
import { ApiError } from "../../../shared/api/api-client";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import { PROFILE_AVATAR_IDS, updateUserProfile, type UserProfile } from "../api/user-profile";
import { useUserProfile, userProfileKey } from "../queries/use-user-profile";
import "./PersonalProfile.css";

const schema = z.object({
  displayName: z.string().trim().min(1, "Ingresa tu nombre.").max(120, "Usa hasta 120 caracteres."),
  birthYear: z.string().trim().refine((value) => value === "" || /^\d{1,4}$/.test(value), "Ingresa un año entero."),
  username: z.string().trim(),
  phone: z.string().trim(),
  avatarId: z.enum(["", ...PROFILE_AVATAR_IDS]),
});
type Fields = z.infer<typeof schema>;
const fields = (profile: UserProfile): Fields => ({ displayName: profile.displayName ?? "", birthYear: profile.birthYear == null ? "" : String(profile.birthYear), username: profile.username ?? "", phone: profile.phone ?? "", avatarId: profile.avatarId ?? "" });
const avatars = [
  { id: "", label: "Sin avatar", Icon: UserRound },
  { id: "user", label: "Persona", Icon: UserRound },
  { id: "leaf", label: "Hoja", Icon: Leaf },
  { id: "sun", label: "Sol", Icon: Sun },
  { id: "mountain", label: "Montaña", Icon: Mountain },
] as const;
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
    return updateUserProfile(profile.id, { displayName: values.displayName, birthYear: values.birthYear ? Number(values.birthYear) : null, username: values.username || null, phone: values.phone || null, avatarId: values.avatarId || null, expectedUpdatedAt: version.current }, accessToken, controller.current.signal);
  } });
  const pending = mutation.isPending || isSubmitting;
  useEffect(() => { if (!isDirty && !pending && !conflict) { form.reset(fields(profile)); version.current = profile.updatedAt; } }, [profile.displayName, profile.birthYear, profile.username, profile.phone, profile.avatarId, profile.updatedAt, isDirty, pending, conflict, form.reset]);
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
    <div aria-live="polite">{saved && !isDirty ? <p role="status">Los cambios de tu cuenta se guardaron.</p> : null}{mutation.isError ? <p role="alert">{blocked ? "No puedes editar este perfil. Actualiza la información para revisar tu acceso." : conflict ? "Tu perfil cambió desde que empezaste a editar. Consulta los datos actuales antes de volver a guardar." : mutation.error.message}</p> : null}</div>
    {blocked ? <Button variant="secondary" loading={reloading} loadingLabel="Actualizando." onClick={() => { void reload(); }}>Actualizar cuenta</Button> : <>
      <fieldset className="personal-profile__avatars" role="radiogroup" disabled={pending} aria-describedby="personal-avatar-help">
        <legend>Avatar de perfil (opcional)</legend>
        <p id="personal-avatar-help" className="personal-profile__help">Elige una imagen para tu cuenta.</p>
        <div className="personal-profile__avatar-options">
          {avatars.map(({ id, label, Icon }) => <label key={id} className="personal-profile__avatar-option">
            <input type="radio" value={id} {...form.register("avatarId")} />
            <Icon size={24} strokeWidth={2} aria-hidden="true" />
            <span>{label}</span>
          </label>)}
        </div>
      </fieldset>
      <div className="personal-profile__fields">
        <Input id="personal-display-name" label="Nombre completo" autoComplete="name" required maxLength={120} {...form.register("displayName")} error={form.formState.errors.displayName?.message} disabled={pending} />
        <div className="personal-profile__field-help">
          <Input id="personal-username" label="Nombre de usuario (opcional)" maxLength={50} autoComplete="off" aria-describedby="personal-username-help" {...form.register("username")} error={form.formState.errors.username?.message} disabled={pending} />
          <p id="personal-username-help" className="personal-profile__help">Es un alias de tu perfil. Para iniciar sesión usa tu correo.</p>
        </div>
        <div className="personal-profile__field-help">
          <Input id="personal-birth-year" label="Año de nacimiento (opcional)" type="text" inputMode="numeric" autoComplete="bday-year" placeholder="Ej.: 1990" aria-describedby="personal-birth-year-help" {...form.register("birthYear")} error={form.formState.errors.birthYear?.message} disabled={pending} />
          <p id="personal-birth-year-help" className="personal-profile__help">Solo el año, sin día ni mes.</p>
        </div>
        <div className="personal-profile__field-help">
          <Input id="personal-phone" label="Teléfono (opcional)" type="tel" autoComplete="tel" placeholder="+595…" aria-describedby="personal-phone-help" {...form.register("phone")} error={form.formState.errors.phone?.message} disabled={pending} />
          <p id="personal-phone-help" className="personal-profile__help">Usa el formato internacional, con + y código de país.</p>
        </div>
      </div>
      <div className="personal-profile__email"><span>Correo electrónico</span><p>{profile.email}</p><p className="personal-profile__help">Este correo se usa para iniciar sesión. Su cambio todavía no está disponible: requiere un proceso seguro de verificación.</p></div>
      <div className="personal-profile__actions"><Button type="submit" disabled={!isDirty || conflict} loading={pending} loadingLabel="Guardando cambios.">Guardar cambios</Button>{conflict ? <Button type="button" variant="secondary" loading={reloading} loadingLabel="Actualizando." onClick={() => { void reload(); }}>Consultar perfil actual</Button> : null}<Button type="button" variant="secondary" disabled={pending || reloading || (conflict ? !freshConflict : !isDirty)} onClick={discard}>Descartar cambios</Button></div>
      {conflict && freshConflict ? <div className="personal-profile__current" role="region" aria-label="Perfil actual consultado">
        <p className="personal-profile__help">Perfil consultado. Usa «Descartar cambios» para comenzar de nuevo con estos datos.</p>
        <dl><div><dt>Nombre completo</dt><dd>{profile.displayName ?? "Sin nombre registrado"}</dd></div><div><dt>Nombre de usuario</dt><dd>{profile.username ?? "Sin registrar"}</dd></div><div><dt>Año de nacimiento</dt><dd>{profile.birthYear ?? "Sin registrar"}</dd></div><div><dt>Teléfono</dt><dd>{profile.phone ?? "Sin registrar"}</dd></div><div><dt>Avatar</dt><dd>{avatars.find((avatar) => avatar.id === (profile.avatarId ?? ""))?.label}</dd></div></dl>
      </div> : null}
    </>}
  </form>;
}
