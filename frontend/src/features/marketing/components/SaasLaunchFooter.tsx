import { ArrowUpRight, Code2, Link2, MessageCircle, Share2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

type FooterLink = { label: string; href: string };
const footerLinks: { producto: FooterLink[]; ayuda: FooterLink[] } = {
  producto: [
    { label: "Inicio", href: "#top" },
    { label: "Operación", href: "#features" },
    { label: "Tarifas", href: "#pricing" },
    { label: "Recursos", href: "#features" },
  ],
  ayuda: [
    { label: "Cookies y almacenamiento", href: "/cookies" },
    { label: "Privacidad", href: "/cookies#privacidad" },
    { label: "Preferencias", href: "/cookies#preferencias" },
    { label: "Información legal", href: "/cookies#informacion-legal" },
  ],
};
export function SaasLaunchFooter() { const reducedMotion = useReducedMotion() ?? false; return <motion.footer className="saas-footer" id="footer" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: reducedMotion ? 0 : 0.6 }}><div className="saas-footer__inner"><div className="saas-footer__grid"><div className="saas-footer__brand"><a href="#top">TOP</a><p>La plataforma simple para operar alojamientos pequeños con más claridad, tiempo y hospitalidad.</p><a className="saas-footer__email" href="mailto:hola@topplatform.app">hola@topplatform.app <ArrowUpRight size={17} aria-hidden="true" /></a></div><FooterColumn title="El producto" links={footerLinks.producto} /><FooterColumn title="Lo esencial" links={footerLinks.ayuda} /><div className="saas-footer__column"><h3>La comunidad</h3><ul><li><a href="#footer">Código</a></li><li><a href="#footer">Comunidad</a></li><li className="saas-footer__socials"><a href="#footer" aria-label="Compartir"><Share2 size={19} aria-hidden="true" /></a><a href="#footer" aria-label="Mensajes"><MessageCircle size={19} aria-hidden="true" /></a><a href="#footer" aria-label="Enlace"><Link2 size={19} aria-hidden="true" /></a><a href="#footer" aria-label="Código"><Code2 size={19} aria-hidden="true" /></a></li></ul></div></div><div className="saas-footer__wordmark" aria-hidden="true"><svg viewBox="0 0 320 80" role="presentation"><text x="0" y="68">TOP</text></svg></div></div></motion.footer>; }
function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) { return <div className="saas-footer__column"><h3>{title}</h3><ul>{links.map((link) => <li key={link.label}><a href={link.href}>{link.label}</a></li>)}</ul></div>; }
