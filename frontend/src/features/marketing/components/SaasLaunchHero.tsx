import { ArrowDown, ArrowUpRight, Menu, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

const navigation = [
  { label: "Operación", href: "#features" },
  { label: "Soluciones", href: "#testimonials" },
  { label: "Tarifas", href: "#pricing" },
  { label: "Recursos", href: "#footer" },
];

export function SaasLaunchHero() {
  const [activeLink, setActiveLink] = useState(navigation[0].label);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const reducedMotion = useReducedMotion() ?? false;

  function selectLink(label: string) {
    setActiveLink(label);
    setMobileMenuOpen(false);
  }

  return (
    <section className="saas-hero" aria-labelledby="saas-hero-title">
      <div className="saas-hero__grid" aria-hidden="true" />
      <motion.header className="saas-hero__header" initial={{ opacity: 0, y: reducedMotion ? 0 : -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.55, ease: "easeOut" }}>
        <a className="saas-hero__brand" href="#top" onClick={() => selectLink(navigation[0].label)}>TOP<span aria-hidden="true">•</span></a>
        <nav className="saas-hero__desktop-nav" aria-label="Navegación de referencia">
          <ul>{navigation.map((item) => <li key={item.label}><a className={activeLink === item.label ? "is-active" : ""} href={item.href} aria-current={activeLink === item.label ? "page" : undefined} onClick={() => selectLink(item.label)}>{item.label}</a></li>)}</ul>
        </nav>
        <a className="saas-hero__signin" href="/login">Iniciar sesión</a>
        <button className="saas-hero__menu-button" type="button" aria-expanded={mobileMenuOpen} aria-controls="saas-hero-mobile-nav" aria-label={mobileMenuOpen ? "Cerrar navegación" : "Abrir navegación"} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}</button>
      </motion.header>

      {mobileMenuOpen ? <motion.div id="saas-hero-mobile-nav" className="saas-hero__mobile-nav" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reducedMotion ? 0 : 0.25 }}><nav aria-label="Navegación móvil de referencia">{navigation.map((item) => <a key={item.label} className={activeLink === item.label ? "is-active" : ""} href={item.href} aria-current={activeLink === item.label ? "page" : undefined} onClick={() => selectLink(item.label)}>{item.label}</a>)}<a className="saas-hero__mobile-signin" href="/login">Iniciar sesión</a></nav></motion.div> : null}

      <motion.div className="saas-hero__body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.7, delay: reducedMotion ? 0 : 0.08 }}>
        <div className="saas-hero__top-content">
          <motion.h1 id="saas-hero-title" initial={{ opacity: 0, y: reducedMotion ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.7, delay: reducedMotion ? 0 : 0.12 }}>La operación clara,<br />la hospitalidad en marcha.</motion.h1>
          <motion.a className="saas-hero__cta" href="#features" initial={{ opacity: 0, y: reducedMotion ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.7, delay: reducedMotion ? 0 : 0.2 }}><span>Conocé TOP</span><span className="saas-hero__cta-icon"><ArrowUpRight size={16} aria-hidden="true" /></span></motion.a>
        </div>
        <motion.div className="saas-hero__bottom-content" initial={{ opacity: 0, y: reducedMotion ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.7, delay: reducedMotion ? 0 : 0.28 }}>
          <p>Reservas, disponibilidad y recursos conectados en un solo lugar para que los alojamientos pequeños operen con más calma.</p>
          <div className="saas-hero__socials" aria-label="Enlaces sociales de TOP"><a href="#footer">LinkedIn</a><a href="#footer">Instagram</a><a href="#footer">GitHub</a></div>
          <a className="saas-hero__scroll" href="#features"><span>Descubrí TOP</span><motion.span animate={reducedMotion ? undefined : { y: [0, 4, 0] }} transition={reducedMotion ? undefined : { repeat: Infinity, duration: 1.8, ease: "easeInOut" }}><ArrowDown size={16} strokeWidth={1.5} aria-hidden="true" /></motion.span></a>
        </motion.div>
      </motion.div>
    </section>
  );
}
