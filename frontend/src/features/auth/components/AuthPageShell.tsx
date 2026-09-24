import type { ReactNode } from "react";

interface AuthPageShellProps { children: ReactNode; labelledBy: string; }

export function AuthPageShell({ children, labelledBy }: AuthPageShellProps) {
  return <main className="top-auth-page"><aside className="top-auth-hero" aria-label="TOP, gestión de alojamientos"><img className="top-auth-hero__image" src="/top-auth-hero.png" alt="Alojamiento rodeado de naturaleza al atardecer" /><div className="top-auth-hero__scrim" /><div className="top-auth-hero__content"><div className="top-auth-brand">TOP<span>Gestión de alojamientos</span></div><p className="top-auth-hero__caption">Todo lo que tu equipo necesita para recibir mejor.</p></div></aside><section className="top-auth-panel" aria-labelledby={labelledBy}><div className="top-auth-form-shell">{children}</div></section></main>;
}
