# TOP — Design Context v1

> **Estado: Working v1 / Agent Context.** Contexto operativo para agentes y equipos. No es una especificación definitiva de frontend. Ante conflicto visual, prevalece [Brand Book v1](../10-Brand-Book-v1.md); ante conflicto funcional, prevalecen Domain Bible y Business Rules.

## Propósito de producto

TOP es una plataforma SaaS de operación para pequeños alojamientos de Paraguay y Latinoamérica. La experiencia debe producir **tranquilidad operativa**: el usuario entiende dónde está, qué está pasando, qué puede hacer y qué ocurrió después.

La dirección es **consumer-grade usability + B2B-grade control** y una **modernidad silenciosa**: claridad, jerarquía, espaciado, navegación y estados por encima de ornamentación.

## Jerarquía de decisiones y fuentes

1. Dominio y reglas aprobadas: `docs/03-Domain-Bible.md` y `docs/04-Business-Rules.md`.
2. Alcance y prioridad: `docs/07-Backlog.md`.
3. Arquitectura: `docs/05-Architecture.md`.
4. Decisiones visuales vigentes: [Brand Book v1](../10-Brand-Book-v1.md).
5. Dirección complementaria: [Principios](00-Design-Principles.md), [Arquitectura de información](01-Information-Architecture.md) y [Referencias](Design-References.md).

`docs/08-Fundamentos-de-Diseno-de-Producto.md` contiene decisiones visuales provisionales anteriores. Para tipografía, paleta, tokens y accesibilidad visual, el Brand Book prevalece.

## Marca y lenguaje visual

- Marca: **TOP**.
- Tipografía única: **Plus Jakarta Sans** con fallback de sistema; usar cifras tabulares cuando estén disponibles para importes, tablas y calendarios.
- Iconografía: **Lucide regular**; 20 px como base y 24 px para navegación principal.
- Paleta: Bosque y arcilla. `#155C4C` es primary, `#29434A` secondary y `#B85C38` accent no crítico.
- Fondo: `neutral-25` cálido; superficies blancas. El verde comunica acción, foco y prioridad, no decora toda la interfaz.
- No introducir otra tipografía, librería de iconos o color sin una decisión documentada.

## Tokens y comportamiento visual

- Espaciado, radios, bordes, elevación, foco y movimiento: reutilizar los tokens de Brand Book; no inventar una escala paralela.
- Controles: `radius-md`; tarjetas y diálogos: `radius-lg`; bordes antes que sombras. Máximo dos niveles de elevación visibles.
- Motion: 120/180/240 ms según el token aplicable; transiciones rápidas, discretas y respetuosas de movimiento reducido.
- Foco: visible, con `focus-ring` verde y separación exterior; nunca eliminarlo.
- Accesibilidad mínima: WCAG 2.2 AA. No usar color como única señal; asociar errores a campos y conservar labels visibles.

## Principios UX

1. Mantener visible el Business activo, sección, entidad y período relevantes.
2. Una acción primaria clara por región de decisión.
3. Mostrar estado con texto, iconografía y tratamiento visual, no solo color.
4. Mantener densidad operacional moderada: calma no significa espacio desperdiciado.
5. Acelerar acciones frecuentes y pedir confirmación solo en acciones sensibles.
6. Usar lenguaje del alojamiento; `Resource`, `RatePlan` y otras entidades internas no son navegación por defecto.
7. El frontend explica y el backend decide reglas, estados, permisos, precios y aislamiento.
8. Diseñar siempre default, loading, empty, error, conflict, disabled y responsive además del happy path.
9. Preservar historial cuando el dominio lo exige; no presentar archivo, anulación o fuera de servicio como eliminación.

## Arquitectura de información

Desktop: sidebar persistente, sobrio y secundario frente al contenido. El Business activo siempre es visible.

```text
Inicio

OPERACIÓN: Calendario · Reservas · Disponibilidad
GESTIÓN: Recursos · Contactos · Precios · Pagos · Bloqueos
CONFIGURACIÓN: Negocio · Usuarios y acceso
CUENTA: Perfil · Cerrar sesión
```

Una capacidad backend no implica un ítem en sidebar. Amenities viven en Recursos; temporadas, cálculo y override manual viven en Precios; membresías viven en Usuarios y acceso.

Mobile es primero, con referencia inicial de ~390 px. La navegación inferior conceptual contiene Inicio, Calendario, Reservas y Más. Más agrupa las áreas restantes; no convertir el sidebar desktop en un hamburger gigante.

Breakpoints vigentes: mobile 0–767, tablet 768–1023, desktop 1024–1439 y wide desde 1440 px.

## Estructura de pantallas

- Encabezado: contexto, título y una acción primaria cuando corresponda.
- Listas y tablas: filas escaneables, números alineados y divisores suaves; en móvil usar pares etiqueta–valor o bloques legibles cuando no haya espacio.
- Formularios: labels visibles, grupos cortos, ayuda contextual y errores específicos cercanos al campo.
- Estados sensibles: explicar entidad, consecuencia y acción; confirmar solo acciones con riesgo real.
- Dashboard: útil y sobrio; toda métrica debe conducir a una tarea, nunca ser decorativa.

## Convenciones para Pricing

Precios debe usar lenguaje comercial. Los importes se muestran en moneda del Business, con cifras tabulares y estados explícitos. La calculadora es una capacidad contextual de Precios; no requiere ítem de navegación propio. Un override manual y una temporada son capacidades dentro de Planes tarifarios/Precios, no módulos separados.

No diseñar como definitivo el flujo de Booking, la congelación de PricingSnapshot, Availability o Payments mientras los dominios correspondientes sigan pendientes. Pricing no crea reservas ni modifica reservas confirmadas.

## Contexto de Business y tono

El Business activo permanece visible y nunca se cambia silenciosamente. La UI no mezcla datos de Businesses. Usar español claro, cercano y operativo: preferir «Crear reserva», «Guardar cambios» y mensajes que expliquen la consecuencia; evitar tecnicismos, lenguaje financiero excesivo o una estética turística decorativa.

## Reglas para agentes

1. No inventar capacidades, permisos ni estados de dominio.
2. No convertir entidades técnicas en navegación.
3. No sacrificar mobile por desktop.
4. No usar color como única señal ni introducir una nueva tipografía, iconografía o paleta sin decisión documentada.
5. No copiar literalmente Notion, Linear, Shopify o Stripe; son referencias de aprendizaje.
6. Mantener una acción primaria clara y priorizar claridad sobre decoración.
7. Preservar historial y auditoría cuando el dominio lo requiera.
8. Diseñar error, loading, empty y conflictos junto al happy path.
9. Mantener el Business activo visible en operaciones de negocio.
10. No declarar una pantalla final si depende de un dominio, permiso o flujo aún pendiente.

## Próximos entregables

El Design Foundation requiere, antes de especificaciones de frontend: `02-App-Shell.md`, `03-Design-System.md`, `04-Component-Inventory.md`, `05-Screen-Map.md`, `06-Responsive-Rules.md` y los primeros wireframes validados. No se crean documentos vacíos como sustituto de esa validación.
