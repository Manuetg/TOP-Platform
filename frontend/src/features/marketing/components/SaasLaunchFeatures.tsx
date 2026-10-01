import { AlertTriangle, Clock3, LayoutGrid } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

const highlights = [
  { title: "Visibilidad de operación", description: "Seguí cómo se mueve cada reserva", icon: LayoutGrid },
  { title: "Decisiones más rápidas", description: "Consultá disponibilidad sin cambiar de herramienta", icon: Clock3 },
  { title: "Alertas a tiempo", description: "Detectá bloqueos y conflictos antes de que crezcan", icon: AlertTriangle },
];

export function SaasLaunchFeatures() {
  const reducedMotion = useReducedMotion() ?? false;
  return (
    <section className="saas-section saas-features" id="features" aria-labelledby="saas-features-title">
      <div className="saas-features__copy"><div className="saas-eyebrow"><span aria-hidden="true" />Control de operación</div><h2 id="saas-features-title">Gestioná el sistema, no sólo las tareas.</h2><p>Coordiná reservas, disponibilidad y precios sin depender de planillas dispersas ni cambiar de contexto todo el tiempo.</p><div className="saas-features__highlights">{highlights.map(({ title, description, icon: Icon }) => <div className="saas-highlight" key={title}><span className="saas-highlight__icon"><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span><span><strong>{title}</strong><small>{description}</small></span></div>)}</div><a className="saas-outline-action" href="#pricing">Ver cómo funciona <ArrowRight aria-hidden="true" /></a></div>
      <motion.div className="saas-features__visual" initial={{ opacity: 0, x: reducedMotion ? 0 : 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: reducedMotion ? 0 : 0.7, ease: "easeOut" }} aria-label="Vista conceptual de una operación de alojamiento">
        <div className="saas-flow-card saas-flow-card--incoming"><span className="saas-flow-card__label">Nueva reserva</span><strong>Check-in detectado</strong><div className="saas-flow-card__tags"><span>En vivo</span><span>Entrada</span></div><dl><div><dt>Canal</dt><dd>Directo / OTA</dd></div><div><dt>Recurso</dt><dd>Habitación 03</dd></div><div><dt>Estado</dt><dd>Confirmada</dd></div></dl></div>
        <div className="saas-flow-card saas-flow-card--decision"><span className="saas-flow-card__label">Capa de decisión</span><strong>Disponibilidad y precio</strong><div className="saas-flow-bar" aria-hidden="true"><i /><i /><i /></div><div className="saas-flow-card__legend"><span>Prioridad</span><span>Reglas</span><span>Tarifa</span></div></div>
        <div className="saas-flow-card saas-flow-card--execution"><div className="saas-flow-card__row"><strong>Operación</strong><span>Sincronizada</span></div><p>Reserva lista para recibir al huésped y actualizar disponibilidad.</p><div className="saas-flow-card__tags"><span className="is-success">Lista</span><span className="is-accent">Distribuida</span></div></div>
      </motion.div>
    </section>
  );
}

function ArrowRight(props: React.SVGProps<SVGSVGElement>) { return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" {...props}><path d="M4 10h11" /><path d="m10 5 5 5-5 5" /></svg>; }
