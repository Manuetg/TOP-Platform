# TOP — Frontend Backlog

Última actualización: 2026-08-30

## Objetivo

Este documento define el backlog funcional del frontend de TOP Platform.

El frontend debe consumir los contratos expuestos por el backend sin duplicar reglas de negocio.

Las reglas de negocio continúan siendo responsabilidad del backend y de la documentación oficial del dominio.

---

# 1. Principios de implementación

- React + TypeScript + Vite.
- Arquitectura por features.
- Mobile-first.
- No duplicar reglas de negocio del backend.
- Todo acceso a API debe pasar por una capa compartida.
- Todo flujo debe contemplar estados:
  - loading;
  - success;
  - empty;
  - error.
- Toda funcionalidad debe respetar aislamiento por Business.
- No almacenar secretos en el frontend.
- No versionar `.env.local`.
- Mantener compatibilidad con los contratos Swagger actuales.
- Si backend cambia un contrato consumido por frontend, registrar el impacto en `docs/00-Current-Status.md`.

---

# 2. Estados posibles

- `Completed`
- `In Progress`
- `Planned`
- `Blocked`

---

# 3. Estado general

Total historias frontend: 52

Estado actual:

- Completed: 9
- In Progress: 2
- Planned: 38
- Blocked: 3

---

# 4. FE-FND — Frontend Foundation

## FE-FND-001 — Frontend Project Foundation

Estado: Completed

Objetivo:

Establecer la base técnica del frontend TOP.

Incluye:

- React.
- TypeScript.
- Vite.
- estructura `app/features/shared`.
- TanStack Query Provider.
- Vitest.
- Testing Library.
- oxlint.
- variables de entorno.
- build productivo.
- configuración de puerto 3001.
- fuente Plus Jakarta Sans.

Criterios de aceptación:

- `npm run build` pasa.
- `npm run lint` pasa.
- `npm run test` pasa.
- no se versiona `node_modules`.
- no se versiona `dist`.
- no se versiona `.env.local`.

---

## FE-FND-002 — Shared UI Foundation

Estado: Completed

Objetivo:

Establecer componentes UI reutilizables alineados con la identidad visual TOP.

Implementado:

- Button;
- Input;
- Badge;
- design tokens iniciales;
- Plus Jakarta Sans;
- estados hover, active, focus y disabled;
- soporte de `prefers-reduced-motion`;
- accesibilidad básica en controles;
- tests de Button, Input y Badge.

Criterios de aceptación:

- componentes reutilizables;
- estilos consistentes;
- responsive;
- accesibilidad básica;
- tests en componentes críticos.

---

## FE-FND-003 — API Client Foundation

Estado: In Progress

Objetivo:

Centralizar las llamadas HTTP al backend.

Implementado:

- `apiRequest<T>()`;
- `ApiError`;
- `VITE_API_URL`;
- interpretación básica de errores backend;
- soporte opcional de `Authorization: Bearer`;
- preservación de headers personalizados;
- soporte de respuestas `204`;
- tests unitarios del API client.

Pendiente:

- manejo central de `401`;
- integración con refresh token;
- evitar loops de refresh;
- manejo consistente de errores globales;
- conexión automática con la sesión autenticada.

Criterios de aceptación:

- ninguna feature hace `fetch` directo;
- errores tipados;
- soporte autenticación;
- soporte respuestas 204;
- configuración mediante entorno.

---

## FE-FND-004 — Application Routing & Layout Foundation

Estado: In Progress

Objetivo:

Definir routing y estructura visual base de la aplicación.

Implementado:

- React Router;
- `/login`;
- redirect `/ → /login`;
- ruta catch-all `*`;
- pantalla 404 responsive y accesible;
- navegación desde 404 hacia `/login`;
- App Shell responsive base;
- sidebar persistente en desktop;
- contexto de Business activo visible;
- navegación agrupada por Operación y Gestión;
- navegación inferior mobile con Inicio, Calendario, Reservas y Más;
- estado activo accesible y responsive.
- navegación real del App Shell conectada a React Router;
- rutas `/app` y secciones operativas/gestión;
- soporte de deep links por sección;
- sincronización del estado activo con la URL.
- menú/flujo de `Más` en mobile;

Pendiente:

- rutas protegidas;
- integración con sesión y Business activo real;
- redirecciones según sesión.

Criterios de aceptación:

- rutas públicas y privadas diferenciadas;
- navegación coherente;
- no acceso a pantallas privadas sin sesión válida.

---

## FE-FND-005 — Global App Header

Estado: Completed

Objetivo:

Evolucionar el shell con una barra superior global que concentre contexto y acciones de alto uso.

Debe contemplar:

- Business activo con nombre e imagen;
- acceso al selector de Business cuando corresponda;
- búsqueda global;
- perfil del usuario con avatar;
- acceso a acciones de cuenta;
- adaptación responsive.

Criterios de aceptación:

- el Business activo permanece claramente identificable;
- el header no duplica navegación innecesaria;
- búsqueda y perfil son accesibles;
- mobile conserva una composición compacta;
- datos reales provienen de los contextos correspondientes.

---

## FE-FND-006 — Desktop Context Rail

Estado: Planned

Objetivo:

Incorporar un panel contextual secundario en desktop para información útil sin saturar el contenido principal.

Puede incluir:

- Next Steps;
- actividad reciente;
- vistos recientemente;
- recomendaciones de configuración;
- ayudas contextuales;
- futuras oportunidades de upgrade.

Criterios de aceptación:

- no reduce excesivamente el área operativa principal;
- desaparece o se recompone en tablet/mobile;
- contenido contextual reutilizable;
- no mezcla responsabilidades con la navegación principal.

---

## FE-FND-007 — Interaction & Motion System

Estado: Planned

Objetivo:

Definir un sistema consistente de microinteracciones y movimiento que refuerce la percepción de calidad del producto.

Debe contemplar:

- motion tokens;
- hover;
- pressed/active;
- elevación;
- transiciones de panels y menus;
- feedback visual de interacción;
- `prefers-reduced-motion`.

Criterios de aceptación:

- animaciones sutiles y consistentes;
- ninguna animación bloquea interacción;
- no se utilizan movimientos decorativos innecesarios;
- accesibilidad de movimiento respetada;
- patrones reutilizables en toda la aplicación.

---

## FE-FND-008 — Visual Surface & Button Polish

Estado: Planned

Objetivo:

Elevar la calidad visual de los componentes base y superficies de TOP.

Debe contemplar:

- variantes de Button consistentes;
- tamaños `sm`, `md` y `lg` cuando sean necesarios;
- icon buttons;
- estados hover, focus, pressed y disabled;
- sombras/elevation;
- cards;
- panels;
- borders y surfaces coherentes;
- uso consistente de tokens.

Criterios de aceptación:

- componentes no parecen controles browser genéricos;
- no se duplican estilos por feature;
- cumple accesibilidad de foco y contraste;
- visualmente consistente en toda la plataforma.

---


## FE-FND-009 — Global Search

Estado: Planned

Objetivo:

Convertir la búsqueda global del App Header en un punto de acceso unificado a módulos y entidades del Business activo.

Debe contemplar:

- módulos de navegación;
- Resources por nombre e `internalCode`;
- Contacts por nombre y otros campos permitidos por backend;
- Bookings por identificadores y datos buscables soportados;
- agrupación de resultados por tipo;
- navegación al detalle correspondiente;
- debounce de consultas;
- estados loading, empty y error;
- aislamiento estricto por Business activo.

Arquitectura esperada:

- frontend no debe descargar datasets completos para realizar la búsqueda;
- backend debe ser fuente de verdad para búsqueda de entidades;
- preferir un endpoint de búsqueda global scoped al Business;
- resultados deben devolver tipo, identificador, título y contexto suficiente para navegación.

Ejemplo conceptual:

`GET /api/businesses/{businessId}/search?q={query}`

Fuera de alcance:

- definir índices o implementación interna de búsqueda del backend;
- búsqueda entre Businesses sin autorización;
- resultados de entidades para las que el usuario no tenga acceso.

Criterios de aceptación:

- buscar `Cabaña 1` puede devolver el Resource correspondiente;
- buscar un Contact puede devolver su ficha;
- módulos continúan apareciendo como resultados;
- resultados están agrupados y diferenciados visualmente;
- seleccionar un resultado navega al destino correcto;
- búsqueda respeta Business y permisos;
- no se duplican reglas de negocio en frontend.

---

## FE-FND-010 — Frontend Containerization

Estado: Completed

Objetivo:

Containerizar el frontend de TOP para disponer de un runtime reproducible y alineado con el stack Docker local de la plataforma.

Implementado:

- Dockerfile multi-stage;
- build productivo con Node 22;
- runtime estático con Nginx;
- configuración de `VITE_API_URL` mediante build argument;
- SPA fallback hacia `index.html`;
- endpoint `/health`;
- healthcheck Docker;
- `.dockerignore`;
- integración del frontend al Docker Compose existente;
- exposición del frontend en `localhost:3001`;
- integración con API en `localhost:3000`;
- validación end-to-end con login y Resources.

Arquitectura local:

- PostgreSQL: `localhost:5432`;
- API: `localhost:3000`;
- Frontend: `localhost:3001`.

Criterios de aceptación:

- `npm run test` pasa;
- `npm run build` pasa;
- `npm run lint` pasa;
- imagen Docker frontend construye correctamente;
- Nginx responde `200` en `/`;
- `/health` responde `200`;
- deep links SPA no devuelven `404`;
- frontend consume correctamente el API desde el navegador;
- stack PostgreSQL + API + frontend puede levantarse mediante Docker Compose;
- login y Resources funcionan desde el frontend containerizado.

---
# 5. FE-IAM — Identity & Session

## FE-IAM-001 — Login

Estado: In Progress

Objetivo:

Permitir que un usuario inicie sesión con credenciales válidas.

Implementado:

- formulario;
- React Hook Form;
- Zod;
- POST `/api/auth/login`;
- manejo básico de 400/401/403.

Pendiente:

- crear sesión real;
- redirigir al área privada;
- eliminar `console.log` como resultado final.

Criterios de aceptación:

- credenciales válidas crean sesión;
- credenciales inválidas muestran error;
- usuario deshabilitado muestra error;
- loading visible;
- al finalizar correctamente se accede a la aplicación.

---

## FE-IAM-002 — Authenticated Session State

Estado: Completed

Objetivo:

Mantener en memoria el estado del usuario autenticado durante el uso actual de la aplicación.

Implementado:

- estado de sesión centralizado mediante `AuthProvider`;
- access token;
- refresh token;
- usuario autenticado;
- memberships;
- estado autenticado/no autenticado;
- integración del login con el estado de sesión;
- tests del estado inicial y establecimiento de sesión.

Fuera de alcance:

- persistencia entre recargas — FE-IAM-003;
- rotación de refresh token — FE-IAM-004;
- logout — FE-IAM-005;
- protected routes — FE-IAM-006;
- Business activo — FE-BUS-001;
- Authorization Bearer en API client — FE-FND-003.

Criterios de aceptación:

- existe una única fuente de estado de autenticación;
- la sesión devuelta por login queda disponible globalmente;
- access token, refresh token, usuario y memberships quedan disponibles en memoria;
- el estado distingue usuario autenticado y no autenticado;
- no se implementa persistencia ni lógica de refresh en esta historia.

---

## FE-IAM-003 — Session Persistence

Estado: Planned

Objetivo:

Restaurar una sesión válida al recargar el navegador.

Criterios de aceptación:

- reload no obliga a loguearse si la sesión puede renovarse;
- sesión inválida vuelve a login;
- no se expone información sensible innecesaria.

---

## FE-IAM-004 — Refresh Token Rotation

Estado: Planned

Objetivo:

Renovar la sesión mediante backend sin intervención del usuario.

Endpoint backend:

- `POST /api/auth/refresh`

Criterios de aceptación:

- se usa el nuevo refresh token devuelto;
- el token anterior deja de utilizarse;
- no se crean loops infinitos;
- ante refresh inválido se limpia sesión.

---

## FE-IAM-005 — Logout

Estado: Planned

Objetivo:

Cerrar la sesión de forma consistente.

Endpoint backend:

- `POST /api/auth/logout`

Criterios de aceptación:

- backend recibe refresh token;
- sesión local se limpia;
- usuario vuelve a `/login`;
- logout repetido no rompe UI.

---

## FE-IAM-006 — Protected Routes

Estado: Planned

Objetivo:

Impedir acceso a pantallas privadas sin sesión válida.

Criterios de aceptación:

- usuario anónimo es redirigido a login;
- usuario autenticado no vuelve a login salvo logout/expiración;
- refresh de navegador conserva comportamiento correcto.

---

# 6. FE-BUS — Business Context

## FE-BUS-001 — Active Business Context

Estado: Planned

Objetivo:

Mantener un Business activo para operaciones multi-tenant.

Criterios de aceptación:

- business activo accesible globalmente;
- APIs privadas usan el `businessId` correcto;
- un solo membership selecciona automáticamente el Business.

---

## FE-BUS-002 — Business Selector

Estado: Planned

Objetivo:

Permitir seleccionar el Business activo cuando el usuario pertenece a más de uno.

Criterios de aceptación:

- lista memberships disponibles;
- cambio de Business actualiza contexto;
- datos anteriores no quedan mezclados.

---

## FE-BUS-003 — Business Profile

Estado: Planned

Objetivo:

Mostrar y editar la información principal del establecimiento según permisos y contrato backend.

Criterios de aceptación:

- muestra datos actuales;
- edición usa backend;
- errores se muestran correctamente;
- no duplica reglas de negocio.

---

# 7. FE-RES — Resources

## FE-RES-001 — Resource List

Estado: Completed

Objetivo:

Mostrar y gestionar visualmente las cabañas, habitaciones o unidades del Business con calidad cercana a producción.

Debe mostrar como mínimo:

- nombre;
- `internalCode`;
- capacidad;
- estado;
- amenities principales cuando existan;
- imagen del Resource o fallback visual TOP cuando corresponda;
- acciones disponibles según las historias implementadas.

Debe contemplar:

- loading state;
- empty state con CTA;
- error state y retry;
- success state;
- diseño responsive mobile/tablet/desktop;
- jerarquía visual clara;
- estados hover/focus;
- microinteracciones sutiles;
- accesibilidad básica;
- preparación visual para usage/límites de plan sin inventar reglas de negocio.

Criterios de aceptación:

- consume el contrato backend de Resources;
- no duplica reglas de negocio;
- la pantalla es usable en mobile y desktop;
- la lista tiene calidad visual cercana al producto objetivo;
- estados ACTIVE, OUT_OF_SERVICE y ARCHIVED tienen representación comprensible;
- ausencia de imagen no deja un espacio visual roto;
- tests cubren estados críticos de la pantalla.

---

## FE-RES-002 — Resource Detail

Estado: Completed

Objetivo:

Mostrar la ficha completa de una unidad.

Implementado:

- ruta `/app/resources/:resourceId`;
- consumo del detalle real del Resource;
- nombre, `internalCode` y estado;
- descripción con fallback;
- capacidad de huéspedes y niños;
- amenities asignados;
- fallback visual cuando no existe imagen disponible;
- navegación hacia atrás al listado;
- estados loading y error con retry;
- diseño responsive mobile/desktop;
- tests del API y pantalla de detalle.

Fuera de alcance:

- edición del Resource — FE-RES-004;
- transiciones operativas — FE-RES-005;
- upload y gestión de imágenes — FE-RES-006;
- gestión de amenities — FE-RES-006.
---

## FE-RES-003 — Create Resource

Estado: Completed

Objetivo:

Permitir crear una nueva unidad.

Implementado:

- ruta `/app/resources/new`;
- navegación desde el listado de Resources;
- formulario responsive mobile/desktop;
- creación real mediante `POST /api/businesses/:businessId/resources`;
- validación frontend con Zod y React Hook Form;
- nombre, descripción, capacidades y orden;
- `internalCode` generado automáticamente a partir del nombre;
- normalización del código interno a formato compatible con backend;
- feedback de errores;
- redirección al detalle luego de crear;
- backend continúa siendo autoridad final de reglas de negocio;
- test de integración de la capa API;
- validación visual y funcional end-to-end en entorno Docker.

Fuera de alcance:

- edición del Resource — FE-RES-004;
- transiciones operativas — FE-RES-005;
- upload y gestión de imágenes — FE-RES-006;
- gestión de amenities — FE-RES-006;
- persistencia y renovación de sesión — FE-IAM-003 / FE-IAM-004.
---

## FE-RES-004 — Edit Resource

Estado: Completed

Objetivo:

Modificar datos de una unidad existente.

Implementado:

- ruta `/app/resources/:resourceId/edit`;
- navegación a edición desde el detalle del Resource;
- carga de datos actuales del Resource;
- formulario responsive reutilizando las reglas visuales del módulo;
- edición real mediante `PATCH /api/businesses/:businessId/resources/:resourceId`;
- validación frontend con Zod y React Hook Form;
- edición de nombre, `internalCode`, descripción, capacidades y orden;
- normalización de `internalCode` a mayúsculas antes del envío;
- manejo de errores del backend;
- actualización inmediata de la cache del detalle tras guardar;
- invalidación del listado de Resources para evitar datos desactualizados;
- navegación nuevamente al detalle después de una edición exitosa;
- test del contrato de actualización.

Fuera de alcance:

- transiciones operativas — FE-RES-005;
- upload y gestión de imágenes — FE-RES-006;
- gestión de amenities — FE-RES-006.

---

## FE-RES-005 — Resource Operational Status

Estado: Planned

Objetivo:

Mostrar y ejecutar las transiciones de estado soportadas por backend.

El frontend no debe inventar transiciones.

---

## FE-RES-006 — Resource Images & Amenities

Estado: Planned

Objetivo:

Gestionar imágenes y amenities asignados al Resource.

Debe contemplar:

- mostrar imagen real cuando exista;
- mostrar una ilustración default TOP cuando el Resource no tenga imagen;
- el fallback debe respetar Brand y DESIGN de TOP;
- el comportamiento debe ser consistente entre listado y detalle.

Nota:

La administración del catálogo de Amenities está pendiente de revisión funcional/backend y no debe inventarse desde frontend.

---

## FE-RES-007 — Resource Search & Filtering

Estado: Planned

Objetivo:

Permitir localizar Resources rápidamente dentro del Business.

Debe permitir inicialmente:

- búsqueda por nombre;
- búsqueda por `internalCode`;
- filtro por estado.

Criterios de aceptación:

- responsive;
- búsqueda accesible;
- filtros claros;
- empty state específico cuando no existen coincidencias;
- no mezcla Resources de otros Businesses;
- preparada para ampliar filtros sin rehacer la arquitectura.

---

# 7A. FE-SUB — Subscription & Entitlements

## FE-SUB-001 — Subscription Entitlements & Usage UI

Estado: Planned

Objetivo:

Mostrar al usuario el plan contratado, su consumo actual y los límites funcionales disponibles.

Casos iniciales previstos:

- cantidad máxima de Resources;
- uso actual vs límite;
- proximidad al límite;
- límite alcanzado;
- CTA de upgrade.

Ejemplo conceptual:

- Plan Premium — hasta 3 Resources;
- Plan VIP — hasta 6 Resources.

Nota:

Los nombres, precios y límites definitivos de los planes son decisiones comerciales pendientes y no deben hardcodearse como reglas finales del frontend.

Criterios de aceptación:

- backend es autoridad sobre plan, entitlements y límites;
- frontend no permite asumir que ocultar/deshabilitar una acción reemplaza la validación backend;
- usage y límite se representan de forma comprensible;
- existe estado visual para límite alcanzado;
- arquitectura extensible a futuros entitlements como usuarios, almacenamiento, automatizaciones o integraciones.

---

# 8. FE-CON — Contacts

## FE-CON-001 — Contact Search/List

Estado: Planned

Objetivo:

Buscar y listar huéspedes/contactos.

---

## FE-CON-002 — Contact Detail

Estado: Planned

Objetivo:

Mostrar ficha detallada de un Contact.

---

## FE-CON-003 — Create Contact

Estado: Planned

Objetivo:

Crear un huésped/contacto.

---

## FE-CON-004 — Edit Contact

Estado: Planned

Objetivo:

Actualizar información de Contact.

---

# 9. FE-AVL — Availability

## FE-AVL-001 — Availability Check

Estado: Planned

Objetivo:

Consultar disponibilidad de un Resource para un rango de fechas.

Criterios de aceptación:

- usa backend;
- muestra available/unavailable;
- muestra razones de conflicto cuando corresponda;
- frontend no recalcula Availability.

---

## FE-AVL-002 — Availability Calendar

Estado: Planned

Objetivo:

Mostrar disponibilidad de Resources en vista calendario.

Criterios de aceptación:

- responsive;
- rango consultable;
- estados visuales claros;
- backend es fuente de verdad.

---

## FE-AVL-003 — Availability Rules

Estado: Planned

Objetivo:

Mostrar y editar reglas de disponibilidad del Business.

Campos actuales:

- `pendingBlocksAvailability`;
- `bufferBeforeDays`;
- `bufferAfterDays`.

Criterios de aceptación:

- carga valores backend;
- guarda cambios;
- explica visualmente el efecto de cada regla;
- no replica el algoritmo de disponibilidad.

---

# 10. FE-PRI — Pricing

## FE-PRI-001 — Rate Plan List

Estado: Planned

Objetivo:

Mostrar planes tarifarios del Business.

---

## FE-PRI-002 — Create Rate Plan

Estado: Planned

Objetivo:

Crear un Rate Plan y asignarlo a Resources.

---

## FE-PRI-003 — Edit Rate Plan

Estado: Planned

Objetivo:

Editar información y asignaciones de Rate Plan.

---

## FE-PRI-004 — Seasonal Rates

Estado: Planned

Objetivo:

Gestionar tarifas estacionales.

---

## FE-PRI-005 — Price Preview

Estado: Planned

Objetivo:

Consultar el precio calculado por backend para Resource + fechas.

Criterios de aceptación:

- usa endpoint calculate;
- muestra noches;
- muestra total;
- muestra moneda;
- muestra breakdown si está disponible;
- frontend nunca calcula el precio definitivo.

---

# 11. FE-BKG — Booking

## FE-BKG-001 — Booking List

Estado: Planned

Objetivo:

Mostrar reservas del Business con filtros y estados.

---

## FE-BKG-002 — Booking Detail

Estado: Planned

Objetivo:

Mostrar una reserva específica.

Endpoint relevante:

- `GET /api/businesses/{businessId}/bookings/{bookingId}`

---

## FE-BKG-003 — Create Draft Booking

Estado: Planned

Objetivo:

Crear una Booking en estado DRAFT.

Debe permitir:

- Contact;
- Resources;
- check-in;
- check-out;
- adultos;
- niños;
- notas.

---

## FE-BKG-004 — Edit Draft Booking

Estado: Planned

Objetivo:

Editar una Booking mientras backend permita su modificación.

---

## FE-BKG-005 — Submit Booking

Estado: Planned

Objetivo:

Ejecutar transición DRAFT → PENDING.

Endpoint:

- `POST /api/businesses/{businessId}/bookings/{bookingId}/submit`

Criterios de aceptación:

- confirmación visual;
- manejo de conflictos de disponibilidad;
- backend decide validez;
- estado actualizado tras éxito.

---

## FE-BKG-006 — Confirm Booking

Estado: Planned

Objetivo:

Ejecutar transición PENDING → CONFIRMED.

Endpoint:

- `POST /api/businesses/{businessId}/bookings/{bookingId}/confirm`

Criterios de aceptación:

- muestra precio a confirmar;
- soporta flujo de override cuando backend lo permita;
- backend recalcula precio;
- backend persiste PricingSnapshot;
- frontend no genera PricingSnapshot.

---

## FE-BKG-007 — Cancel Booking

Estado: Planned

Objetivo:

Cancelar una reserva cuando backend lo permita.

Endpoint:

- `POST /api/businesses/{businessId}/bookings/{bookingId}/cancel`

Criterios de aceptación:

- confirmación previa;
- resultado CANCELLED;
- manejo de 409;
- historial no desaparece.

---

## FE-BKG-008 — Booking Timeline

Estado: Blocked

Bloqueado por:

- Backend BKG-006.

Objetivo:

Mostrar cronología de eventos de la reserva cuando backend exponga el contrato correspondiente.

---

# 12. FE-BLK — Blocks

## FE-BLK-001 — Block List

Estado: Planned

Objetivo:

Mostrar bloqueos del Business/Resources.

---

## FE-BLK-002 — Create Block

Estado: Planned

Objetivo:

Crear bloqueo operativo para un Resource y rango temporal.

---

## FE-BLK-003 — Cancel Block

Estado: Planned

Objetivo:

Cancelar un bloqueo preservando historial.

---

# 13. FE-PAY — Payments

## FE-PAY-000 — Payment UI Discovery

Estado: Blocked

Bloqueado por:

- Backend Payment pendiente.

Objetivo:

No diseñar contratos definitivos frontend hasta que backend implemente PAY-001..PAY-004.

Cuando backend quede definido, reemplazar esta historia por historias reales de:

- registro de pago;
- detalle;
- historial;
- saldo;
- comprobantes;
- estados.

---

# 14. FE-DSH — Dashboard

## FE-DSH-000 — Dashboard UI Discovery

Estado: Blocked

Bloqueado por:

- Backend Dashboard pendiente.

Objetivo:

No inventar contratos ni KPIs desde frontend.

Cuando backend exponga DSH-001..DSH-004, reemplazar por historias reales.

---

# 15. Roadmap de ejecución

## Fase 1 — Acceso a TOP

Objetivo:

Que Jeni pueda iniciar sesión y entrar a la aplicación.

Historias:

- FE-FND-002
- FE-FND-003
- FE-FND-004
- FE-IAM-001
- FE-IAM-002
- FE-IAM-003
- FE-IAM-004
- FE-IAM-005
- FE-IAM-006

Milestone:

**M1 — Jeni puede iniciar sesión y entrar a TOP.**

---

## Fase 2 — Contexto Tobera

Objetivo:

Que Jeni ingrese al Business correcto.

Historias:

- FE-BUS-001
- FE-BUS-002
- FE-BUS-003
- App Shell privado

Milestone:

**M2 — Jeni puede entrar al panel de Tobera.**

---

## Fase 3 — Configuración operativa

Historias:

- FE-RES-001..006
- FE-CON-001..004
- FE-PRI-001..005
- FE-AVL-001..003
- FE-BLK-001..003

Milestone:

**M3 — Tobera puede configurar su operación diaria.**

---

## Fase 4 — Reservas

Historias:

- FE-BKG-001
- FE-BKG-002
- FE-BKG-003
- FE-BKG-004
- FE-BKG-005
- FE-BKG-006
- FE-BKG-007
- FE-BKG-008 cuando backend esté disponible

Milestone:

**M4 — Tobera puede gestionar una reserva completa desde frontend.**

---

## Fase 5 — Gestión financiera y analítica

Historias:

- FE-PAY-* cuando backend esté disponible
- FE-DSH-* cuando backend esté disponible

---

# 16. Definition of Done frontend

Una historia frontend puede considerarse `Completed` cuando:

- consume contratos backend reales;
- no duplica reglas de negocio;
- contempla loading;
- contempla error;
- contempla empty cuando aplique;
- contempla success;
- es responsive;
- cumple accesibilidad básica;
- no contiene secretos;
- TypeScript compila;
- `npm run build` pasa;
- `npm run lint` pasa;
- tests relevantes pasan;
- el cambio está en una rama feature;
- el PR apunta a `develop`;
- si cambia un contrato consumido, se actualiza `docs/00-Current-Status.md`.

---

# 17. Dependencia con Backend

Responsable backend: Rolo.

Responsable frontend: Emanuel.

Regla:

Frontend no debe modificar backend para resolver inconsistencias de contrato.

Si frontend necesita un cambio backend:

1. registrar hallazgo;
2. documentar endpoint afectado;
3. describir comportamiento esperado;
4. enviar al responsable backend;
5. esperar contrato actualizado;
6. adaptar frontend después de merge a `develop`.

---

# 18. Estado inicial resumido

| Épica | Completed | In Progress | Planned | Blocked |
|---|---:|---:|---:|---:|
| Foundation | 1 | 3 | 0 | 0 |
| IAM | 0 | 1 | 5 | 0 |
| Business | 0 | 0 | 3 | 0 |
| Resource | 0 | 0 | 6 | 0 |
| Contact | 0 | 0 | 4 | 0 |
| Availability | 0 | 0 | 3 | 0 |
| Pricing | 0 | 0 | 5 | 0 |
| Booking | 0 | 0 | 7 | 1 |
| Block | 0 | 0 | 3 | 0 |
| Payment | 0 | 0 | 0 | 1 |
| Dashboard | 0 | 0 | 0 | 1 |
| **TOTAL** | **1** | **4** | **36** | **3** |

