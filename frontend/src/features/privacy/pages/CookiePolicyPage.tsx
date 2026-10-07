import { ArrowLeft, Info, ShieldCheck } from "lucide-react";
import "./CookiePolicyPage.css";

const storageEntries = [
  {
    title: "Sesión de trabajo",
    key: "top.auth.session.v1",
    mechanism: "Almacenamiento de sesión del navegador",
    purpose: "Permite restaurar tu acceso y las membresías de tus negocios al recargar la página.",
    duration: "Se conserva en la sesión del navegador y se retira al cerrar sesión o cuando TOP rechaza su restauración.",
  },
  {
    title: "Mantener sesión iniciada",
    key: "top.auth.session.v1",
    mechanism: "Almacenamiento local, si eliges esta opción al iniciar sesión",
    purpose: "Permite intentar restaurar tu sesión entre visitas. No conserva tu contraseña.",
    duration: "La entrada local no tiene una fecha de borrado automático. Se retira al cerrar sesión, si su restauración falla o al borrar los datos del sitio. La validez de la sesión la controla el servidor.",
  },
  {
    title: "Recuperación de contraseña",
    key: "top.auth.reset-grant.v1",
    mechanism: "Almacenamiento de sesión del navegador",
    purpose: "Permite completar el cambio de contraseña después de verificar el código recibido por correo.",
    duration: "Se elimina al completar el cambio de contraseña. Si abandonas el proceso, puede permanecer en la sesión del navegador aunque la autorización de recuperación ya haya vencido.",
  },
  {
    title: "Presentación de la barra lateral",
    key: "top.sidebar.collapsed.v1",
    mechanism: "Almacenamiento local del navegador",
    purpose: "Recuerda si eliges contraer o expandir la barra lateral.",
    duration: "No tiene un plazo de expiración automático. Se actualiza al cambiar esa preferencia y se elimina al borrar los datos del sitio.",
  },
];

export function CookiePolicyPage() {
  return (
    <div className="top-privacy-page">
      <a className="top-privacy-skip" href="#politica">Ir a la política</a>
      <header className="top-privacy-header">
        <a className="top-privacy-brand" href="/showcase/saas-launch" aria-label="TOP, volver a la presentación">TOP</a>
        <a className="top-privacy-back" href="/showcase/saas-launch"><ArrowLeft size={18} aria-hidden="true" /> Volver a TOP</a>
      </header>
      <main className="top-privacy-content" id="politica" tabIndex={-1}>
        <header className="top-privacy-intro">
          <ShieldCheck size={28} aria-hidden="true" />
          <h1>Cookies y almacenamiento local</h1>
          <p>Cómo utiliza TOP los datos de tu navegador y cómo puedes gestionar tus preferencias.</p>
          <p className="top-privacy-date">Revisión técnica: 1 de octubre de 2026</p>
        </header>
        <aside className="top-privacy-notice" aria-label="Estado de la información legal">
          <Info size={20} aria-hidden="true" />
          <p>Esta página describe el uso técnico de la versión actual. La información legal y los proveedores de producción están pendientes de validación. <a href="#informacion-legal">Consultar los pendientes</a>.</p>
        </aside>
        <nav className="top-privacy-index" aria-label="Contenido de la política">
          <a href="#almacenamiento">Qué se guarda</a>
          <a href="#preferencias">Preferencias</a>
          <a href="#privacidad">Privacidad</a>
          <a href="#informacion-legal">Información legal</a>
        </nav>
        <section className="top-privacy-section" aria-labelledby="uso-title">
          <h2 id="uso-title">Qué utiliza esta versión</h2>
          <p>Las cookies y el almacenamiento local son mecanismos diferentes. TOP utiliza almacenamiento local y de sesión para el acceso, la recuperación de contraseña y la presentación de la navegación.</p>
          <p>La aplicación no configura cookies propias ni integra herramientas de analítica o publicidad de seguimiento. El inventario del alojamiento web y otros servicios del entorno de producción todavía debe validarse.</p>
        </section>
        <section className="top-privacy-section" id="almacenamiento" aria-labelledby="almacenamiento-title">
          <h2 id="almacenamiento-title">Qué se guarda en el navegador</h2>
          <p>La información de sesión incluye una credencial renovable, datos de tu cuenta y tus membresías. El token de acceso se mantiene en memoria. No se guarda tu contraseña en estas entradas.</p>
          <div className="top-privacy-inventory">
            {storageEntries.map((entry) => (
              <article className="top-privacy-entry" key={entry.title}>
                <h3>{entry.title}</h3>
                <dl>
                  <div><dt>Finalidad</dt><dd>{entry.purpose}</dd></div>
                  <div><dt>Mecanismo</dt><dd>{entry.mechanism}</dd></div>
                  <div><dt>Duración y eliminación</dt><dd>{entry.duration}</dd></div>
                  <div><dt>Identificador</dt><dd><code>{entry.key}</code></dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
        <section className="top-privacy-section" id="preferencias" aria-labelledby="preferencias-title">
          <h2 id="preferencias-title">Gestionar tus preferencias</h2>
          <ul className="top-privacy-list">
            <li><strong>Persistencia de sesión.</strong> Elige «Mantener sesión iniciada» al iniciar sesión si quieres conservarla entre visitas. Para retirar la sesión local, utiliza «Cerrar sesión» dentro de TOP.</li>
            <li><strong>Barra lateral.</strong> Utiliza «Contraer barra lateral» o «Expandir barra lateral» en la aplicación. TOP recuerda la presentación que eliges.</li>
            <li><strong>Datos del sitio.</strong> Puedes eliminarlos desde la configuración de privacidad de tu navegador. Esto puede cerrar tu sesión, interrumpir una recuperación de contraseña y restablecer la presentación de la navegación.</li>
          </ul>
          <p>Estas preferencias corresponden a funciones que utilizas en TOP. Esta versión no ofrece categorías de analítica o publicidad que activar o rechazar.</p>
        </section>
        <section className="top-privacy-section" id="privacidad" aria-labelledby="privacidad-title">
          <h2 id="privacidad-title">Privacidad y servicios externos</h2>
          <p>TOP utiliza datos de cuenta y membresías para gestionar el acceso. Los datos del negocio, recursos, contactos, reservas y cobros permiten realizar las operaciones del alojamiento.</p>
          <p>La verificación de correo y la recuperación de contraseña utilizan correo electrónico. Las imágenes de recursos se almacenan mediante un servicio compatible con S3 y se consultan mediante enlaces temporales. La identidad y ubicación de los proveedores de producción están pendientes de confirmación.</p>
          <p>Si eliges «Abrir WhatsApp», sales de TOP hacia WhatsApp con el número del contacto seleccionado. Ese servicio administra su propio tratamiento de datos.</p>
          <p>Borrar los datos del navegador no elimina registros del servidor. Archivar una entidad conserva su historial. Los plazos generales de retención y el procedimiento para solicitudes de privacidad todavía deben definirse.</p>
        </section>
        <section className="top-privacy-section top-privacy-pending" id="informacion-legal" aria-labelledby="legal-title">
          <h2 id="legal-title">Información legal pendiente de validación</h2>
          <p>Antes de publicar las condiciones legales completas del servicio, deben confirmarse:</p>
          <ul className="top-privacy-list">
            <li>La identidad del operador y responsable del tratamiento.</li>
            <li>El contacto de privacidad y el procedimiento de atención de solicitudes.</li>
            <li>La jurisdicción y el marco jurídico aplicable.</li>
            <li>Los proveedores de producción, sus ubicaciones y el tratamiento de datos asociado.</li>
            <li>Los plazos de retención de datos y las condiciones del servicio.</li>
          </ul>
          <p>Esta información técnica no sustituye las condiciones del servicio ni una política jurídica de privacidad completa.</p>
        </section>
      </main>
      <footer className="top-privacy-footer"><a href="/showcase/saas-launch">Volver a la presentación de TOP</a></footer>
    </div>
  );
}
