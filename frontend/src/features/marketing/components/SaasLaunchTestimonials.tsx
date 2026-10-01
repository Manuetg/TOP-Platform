import { CheckCircle2, Heart, Repeat2 } from "lucide-react";
import { useState } from "react";

const testimonials = [
  { name: "María Benítez", role: "Posada familiar", text: "La disponibilidad dejó de depender de tres planillas. Ahora todo el equipo entiende qué pasa.", initials: "MB", replies: 24, likes: 51 },
  { name: "Jorge Rojas", role: "Cabañas del lago", text: "TOP se adapta a nuestra forma de trabajar sin obligarnos a aprender una operación nueva.", initials: "JR", replies: 13, likes: 37 },
  { name: "Carolina Vera", role: "Hostería urbana", text: "Menos ruido, menos dudas. La información importante está donde la necesitás.", initials: "CV", replies: 17, likes: 44 },
  { name: "Luis Ferreira", role: "Alojamiento rural", text: "Puedo revisar la operación en minutos y volver a atender a los huéspedes.", initials: "LF", replies: 31, likes: 78 },
  { name: "Sofía Duarte", role: "Casa de huéspedes", text: "Las decisiones tienen el contexto justo. No perdemos tiempo buscando el dato correcto.", initials: "SD", replies: 15, likes: 40 },
  { name: "Nico Acosta", role: "Apart hotel", text: "La adopción fue rápida porque cada pantalla habla el lenguaje de la operación.", initials: "NA", replies: 28, likes: 66 },
  { name: "Paola Franco", role: "Refugio familiar", text: "Reemplazamos varias herramientas y ganamos una forma de trabajar más tranquila.", initials: "PF", replies: 10, likes: 26 },
  { name: "Diego Giménez", role: "Hotel boutique", text: "Rápido, predecible y cuidado. Se nota que las decisiones parten del día a día.", initials: "DG", replies: 20, likes: 54 },
  { name: "Ana López", role: "Hostel independiente", text: "La respuesta es inmediata y el equipo no siente ansiedad cada vez que llega una reserva.", initials: "AL", replies: 18, likes: 48 },
];

export function SaasLaunchTestimonials() {
  return <section className="saas-section saas-testimonials" id="testimonials" aria-labelledby="saas-testimonials-title"><header className="saas-centered-heading"><h2 id="saas-testimonials-title">La operación se siente más simple.</h2><p>Historias provisionales de alojamientos que buscan trabajar con menos fricción.</p></header><div className="saas-testimonials__grid">{testimonials.map((testimonial) => <TestimonialCard key={testimonial.name} {...testimonial} />)}</div></section>;
}

function TestimonialCard({ name, role, text, initials, replies, likes }: (typeof testimonials)[number]) {
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  return <article className="saas-testimonial-card"><div className="saas-testimonial-card__header"><div className="saas-testimonial-card__person"><span className="saas-avatar" aria-hidden="true">{initials}</span><span><strong>{name}<CheckCircle2 size={14} aria-label="Perfil verificado" /></strong><small>{role}</small></span></div><span className="saas-testimonial-card__mark" aria-label="Testimonio de TOP">TOP</span></div><p>{text}</p><div className="saas-testimonial-card__meta"><time dateTime="2026-09-28">28 sep, 2026</time><div><button type="button" className={liked ? "is-pressed" : ""} aria-pressed={liked} aria-label={`${liked ? "Quitar me gusta" : "Dar me gusta"} a ${name}`} onClick={() => setLiked((value) => !value)}><Heart size={15} fill={liked ? "currentColor" : "none"} aria-hidden="true" />{likes + (liked ? 1 : 0)}</button><button type="button" className={reposted ? "is-pressed" : ""} aria-pressed={reposted} aria-label={`${reposted ? "Quitar" : "Compartir"} testimonio de ${name}`} onClick={() => setReposted((value) => !value)}><Repeat2 size={15} aria-hidden="true" />{replies + (reposted ? 1 : 0)}</button></div></div></article>;
}
