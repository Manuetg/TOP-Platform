# TOP — Estado actual y handoff

Última actualización: 2026-09-24

## Handoff vigente — POST-MVP / PRODUCTION READINESS

Baseline remoto verificado: `develop@cb9eddcb5eb9fcd55008555a29bb478d71f6009a`, PR #90–95 integradas y ninguna PR abierta al iniciar. Checkout local limpio; rama `post-mvp/ux-functional-refinement` creada desde origin/develop. El handoff siguiente se conserva como historial, no como estado actual de esas PR.

Épico A: implementación y gates completos; **Completed preparado, efectivo al merge de [PR #96](https://github.com/Manuetg/TOP-Platform/pull/96)**. Hasta ese merge sigue sin integrar en develop. B/C/D: Planned. E: Discovery. Roadmap completo en [06-Roadmap.md](06-Roadmap.md). Backend MVP permanece **53/53 Completed**; recuento frontend histórico intacto. No se declara Product Ready ni Production Ready; decisión comercial de FE-SUB-001 sigue pendiente antes de producción.

Gaps del baseline resueltos: fechas de presentación inconsistentes, selector Pricing sin estados Foundation completos, teléfonos sin normalización backend, ausencia de archivo explícito Contact, window.confirm en Resources, inputs Booking ad-hoc y modo configurado visible sin planes. OverlayPanel, consulta contextual Rate Plans y permisos backend ya existen.

A7: el contrato actual exige Rate Plan incluso para precio manual; sin planes se explica el bloqueo para todos los roles. No se inventa un tarifario ni se amplía Pricing. A3/A4 son cambios backend post-MVP explícitamente aprobados; su contrato y evidencia se registran en el backlog separado. QA interactiva: NOT RUN por instrucción de esta ejecución. CI propios del nuevo épico: ambos SUCCESS; evidencia debajo.

### Implementación y verificación del Épico A

Implementados A1–A7 en esta rama: helper de fechas puro y formatter de instantes por Business; interacción Foundation en Pricing; teléfono internacional en alta/edición/alta contextual y WhatsApp; archivo Contact auditado; ConfirmDialog en Contact/Resources; inputs Booking; cero tarifas con bloqueo explícito, cancelación contextual y permiso de override también en confirmación backend. La API de fechas permanece intacta.

Migración aditiva pendiente de despliegue: `20260924000000_contact_archive_audit`. Sin cambios de infraestructura, sin migraciones sobre datos locales/reales, sin B/C/D/E implementados. `libphonenumber-js/min` se declara explícitamente (ya existía transitivamente en backend), fijada en ambos lockfiles; chunk diferido aproximado 121 kB / 30 kB gzip.

Validación local: lint/build frontend y backend, Prisma validate, arquitectura y diff check PASS. Regresión focal backend: 73 pruebas; E2E Contact/seguridad: 33 PASS. Pruebas PostgreSQL de archivo concurrente, idempotencia, historial y aislamiento aprobadas en CI; aceptación de archivo repetido aprobada. Frontend incluye regresiones de bisiesto/null/instantes, focus trap/retorno, teléfonos históricos, cache/cancelación de archivo y planes cero/uno/varios/error/roles/cambio de contexto. La corrida local completa de frontend aprobó 90 archivos/508 pruebas; la prueba posterior de API y Calendar aprobó 25/25. La suite oficial incluye las 509 pruebas finales. Los resultados oficiales corresponden al código implementado; el HEAD final con este cierre documental y su checkout sintético se verifican y registran en el cuerpo de la misma PR.

Evidencia oficial de implementación: feature HEAD `151ee2b9c818379fd0ba1648030a8dc231ec7d01`, checkout sintético de PR `a06fe60521b987427061f4c10e4dddfcf8059852` sobre el baseline indicado. No confundir el checkout de GitHub con la rama local.

| Gate oficial | Resultado | Evidencia |
|---|---|---|
| Frontend CI | SUCCESS | [Run 36003408977](https://github.com/Manuetg/TOP-Platform/actions/runs/36003408977): build, lint y 91 archivos/509 pruebas PASS. |
| Backend CI | SUCCESS | [Run 36003409058](https://github.com/Manuetg/TOP-Platform/actions/runs/36003409058): 119 suites/1135 unitarias, 34 suites/178 integración PostgreSQL, 22 suites/260 E2E, 195 escenarios/771 pasos de aceptación. Lint, arquitectura, migraciones, Prisma y build PASS. |
| Cobertura backend | PASS | 175 suites/1573 pruebas; statements 96,07%, branches 88,98%, functions 96,27%, lines 97,11%. Sin rebajar gates. |
| Mutation | SKIPPED | Job omitido por política de pull_request; no equivale a PASS. |

Self-review técnica (no independiente) siguiendo top-frontend-review: sin bloqueantes conocidos tras corregir foco del shell, preservación de teléfonos legacy y targets tardíos. QA manual/interactiva móvil/desktop: **NOT RUN** por instrucción expresa; no equivale a certificación visual o WCAG. Mutation: **SKIPPED** en pull_request según workflow vigente, nunca PASS. DoD técnica acreditada por pruebas y ambos CI; cierre documental preparado en la misma PR, efectivo en develop solo tras revisión/merge humano. No hay aprobación independiente ni auto-merge. Siguiente épico previsto: B, sin inicio automático.

### Revisión final de PR #96 — correcciones UX y discovery

Continuación sobre `f419789876789a83d9a5e456ca1f18438e5fb8e4`, sin cambios remotos posteriores al comenzar. Contact agrupa País/Teléfono/Email y comparte controles entre alta/edición; Calendar reutiliza el teléfono compuesto. Archivo adopta warning terracota en la acción y confirmación, con etiqueta visible móvil. ConfirmDialog agrega backdrop modal al 40%, portal sobre la aplicación y aislamiento inert del fondo; conserva foco, cierre condicionado y reduced-motion. Decisiones visuales acotadas en [Design Context](design/DESIGN.md).

**POST-A7: DECISION REQUIRED** — precio manual sin Rate Plan pendiente de decisión de Producto. Discovery y comparación A/B/C en [Roadmap](06-Roadmap.md#post-a7--discovery-de-precio-manual-sin-rate-plan-revisión-final-pr-96). Se recomienda evaluar C (híbrido excepcional), pero se conserva A vigente: manual siempre sobre un plan seleccionable. No se modifica backend, contrato, Snapshot ni migraciones en esta revisión. No es un bug del contrato actual.

Validación local: 10 archivos/89 pruebas focalizadas PASS (orden/prefijo/payload, warning, backdrop/foco/inert/carga y regresión de shell/Resources), lint/build y diff check PASS. Contraste calculado de texto warning: 5,77:1 en reposo, 5,34:1 en hover y 4,93:1 en pressed; no sustituye QA visual. Los gates oficiales del HEAD final se registran en el cuerpo de la misma PR. Self-review frontend, sin aprobación independiente; QA interactiva **NOT RUN**. Estado: **DECISION REQUIRED** para el modelo futuro de Pricing; correcciones frontend preparadas para revisión PM/TL. PR #96 permanece abierta, sin merge y sin iniciar B.

## Handoff histórico — cierre del MVP por épicos

Baseline `develop@4c866cc` con Payments y Calendar/Pricing mergeados. Implementación en ramas nuevas, sin merge directo ni incorporación de infraestructura local. Las PR están encadenadas y deben revisarse/mergearse en orden:


| Épico | PR / feature HEAD | Evidencia |
|---|---|---|
| Mantenimiento preliminar | #90 / `cca693894b76772902edae973583eb71662423f8` | Frontend CI `35868609248`, Backend CI `35868609614` SUCCESS; Login real desktop/móvil |
| Foundation Polish | #91 / `a6906b0ba1b25807e7a7d7b5a3c47db8d115e1f1` | Frontend CI `35872648453`, Backend CI `35872648438` SUCCESS; QA 1440/1024/390 px |
| Business Management | #92 / `06a6f4c7c62f2e37c1fcbc6a74239ecf3c92c771` | Frontend CI `35875446704`, Backend CI `35875446441` SUCCESS; selector/perfil reales y segundo Business local autorizado |
| Subscription & Entitlements | #93 / `3d101139276c6fa7aab06e090027005de3d4a2cd` | Corrección comercial documental; CI finales del HEAD en #93; enforcement PostgreSQL, QA de 0/8/9/10 y aislamiento |
| Quality gate final | `codex/frontend-quality-gate` | Rutas diferidas (~366 kB), Calendar contextual/cancelable con timezone IANA y escala PYG unificada; HEAD/CI final en cuerpo de su PR |

Subscription conserva una configuración provisional del MVP, pendiente de confirmación comercial antes de producción: TOP Inicial, 10 Resources ACTIVE/OUT_OF_SERVICE; ARCHIVED no consume. Todos los miembros leen capacidad; OWNER registra una solicitud única de ampliación, sin cobro ni cambio automático. Contratos, reglas y operación administrativa documentados en Domain Bible, Business Rules y Architecture.

Quality gate resolvió dos regresiones demostradas: Calendar usaba una variable de demo en vez del Business activo y Pricing/Calendar escalaban PYG por 100 mientras Payments/Dashboard usaban el entero contractual. No se modifican registros financieros históricos ni se recalculan saldos. PYG se muestra/envía como guaraní entero; revisar manualmente cualquier dato introducido con la UI anterior antes de una operación real, sin conversión masiva inferida.

Calendar corrige además Hoy/mes/día comercial con la timezone IANA del Business; Blocks recibe los instantes correspondientes al inicio local y fin exclusivo, preservando fechas puras de Availability. Regresiones deterministas de borde de mes, DST y cambio de contexto; QA interactiva anterior conservada, no repetida. Mutation SKIPPED, no PASS. Los gates finales se ejecutan en GitHub CI y se registran en #93/#94.

Las capacidades internas y su QA se detallan en `docs/14-Frontend-Backlog.md`. El estado efectivo preparado se especifica en «Estado Frontend» y coincide con ese backlog. No se declara merge ni aprobación formal independiente. TOP Inicial / 10 Resources es configuración provisional, no una decisión comercial final. MVP técnicamente integrado no equivale a production readiness: no se declara production-ready ni MVP final cerrado mientras FE-SUB-001 conserve la decisión comercial de nombre/cupo pendiente antes de producción. No habrá PR documental posterior.

QA vigente: Edge 153.0.4234.48, frontend local :3001 y API real :3000/api; desktop 1440×900, tablet 1024×900 (Foundation) y móvil emulado 390×844. Touch físico y cambio real de preferencia de motion del sistema NOT RUN; CSS reduced-motion y regresiones automatizadas acreditadas. No equivale a certificación WCAG completa.

Worktree final: `C:\Users\Sady\workspace\TOP-MVP-Quality`. La ruta Windows es un worktree local, no el checkout sintético de GitHub. Base de QA y archivos ajenos del checkout original preservados. No auto-merge. Las secciones inferiores conservan el historial con sus fechas y no reemplazan este handoff.

## Responsabilidades

### Backend
Responsable: Rolo

Alcance:
- NestJS API
- Prisma / PostgreSQL
- Swagger y contratos API
- Seguridad y autorización backend
- Tests backend
- Migraciones
- Docker backend

### Frontend
Responsable: Emanuel

Alcance:
- React / TypeScript
- UI/UX
- Integración con API
- Routing
- Sesión frontend
- Estados de carga/error
- Diseño responsive/mobile-first

## Estado Backend

Última historia completada:
- DSH-001 — Business Dashboard — Completed

Estado del backlog backend del MVP:
- 53 / 53 capacidades completadas
- 100%

Booking:
- 6 / 6 completadas

Dashboard:
- 4 / 4 completadas (100%)

Capacidad backend actualmente en desarrollo:
- Ninguna.

Siguiente capacidad backend:
- Ninguna dentro del backlog MVP aprobado.

Validación de cambios backend:
- Backend CI en estado `SUCCESS` es obligatorio.
- Mientras `rolandobarros27` sea el único responsable backend, la revisión técnica se registra como `backend self-review documentada`, sin describirla como independiente.
- Una review externa se registra como tal únicamente cuando la realiza una persona con responsabilidad y capacidad técnica real sobre backend; no se aplican waivers automáticos.
- Mutation Testing se difiere al quality gate preproducción por su costo de ejecución; el requisito y sus umbrales permanecen vigentes.

Pendientes principales posteriores:
- Platform Administration / Global Authority pendiente de definición
- quality gate preproducción, incluido Mutation Testing según la decisión vigente

## Estado Frontend

Total historias frontend activas: 52

Estado preparado para integración de la cadena #90 → #91 → #92 → #93 → #94 (no acredita merge ejecutado):

- Completed: 51
- In Progress: 1
- Planned: 0
- Blocked: 0

El único In Progress es FE-SUB-001 — implementación técnica completa; decisión comercial de nombre/cupo pendiente antes de producción.

- Foundation: FE-FND-006/007/008 — Completed — efectivo al integrarse la cadena aprobada en develop.
- Business: FE-BUS-002/003 — Completed — efectivo al integrarse la cadena aprobada en develop.

Recuento efectivo al integrar la cadena: 51 + 1 + 0 + 0 = 52. FE-AVL-002 y FE-PAY-000 son registros históricos excluidos del total activo, como en `docs/14-Frontend-Backlog.md`.

Evidencia histórica de capacidades completadas:
- FE-FND-009 — Completed por merge de [PR #83](https://github.com/Manuetg/TOP-Platform/pull/83), commit `38b8ac0`. La evidencia histórica de integración, reintento controlado, teclado, scroll, cancelación y logout se conserva en el Backlog. Touch real y cambio real de Business/identidad permanecen NOT RUN; Rolo aceptó el riesgo residual para el merge.
- FE-PAY-001 — Completed por merge de [PR #85](https://github.com/Manuetg/TOP-Platform/pull/85), commit `05e6bd6`. Integra saldo e historial de Payments de solo lectura en el detalle de Booking, sobre PAY-003/PAY-004; cubre paginación, refetch, foco, cambios de contexto y logout sin modificar `/app/payments` ni incorporar mutations. Frontend y Backend CI del HEAD final `c766fbc` aprobaron; mutation omitida por política. QA interactiva: NOT RUN por decisión expresa de Rolo.
- Dashboard Business implementado y mergeado en `/app`.
- FE-DSH-001 — Completed.
- FE-BUS-001 — Completed; las siete features tenant-scoped consumen Active Business Context y el ciclo de vida está cubierto por tests.
- FE-FND-004 — Completed preparado, efectivo en `develop` al mergear PR #82. Boundary de contenido bajo ProtectedRoute/BusinessBoundary conserva shell, cuenta, Auth y QueryClient; reintento local y cambio de ruta/identidad/Business recuperan la vista sin reproducir mutations. Respaldo de shell/router y boundary exterior de providers sin dependencias de contexto, con inicio/recarga de documento. FE-FND-003 mantiene errores API locales; no se capturan por sí solos eventos o promesas fuera del árbol React. Frontend CI `35473054747` SUCCESS (Node `v22.23.2`, build, 67 archivos/317 tests, lint); Backend CI `35473054790` SUCCESS. Self-review sin bloqueantes y diff check PASS. HEAD/checkout finales en el cuerpo de la misma PR. QA manual móvil/desktop: NOT RUN; mutation diferida. Backend y trabajo de Manu sin cambios.
- FE-FND-003 — manejo compartido de errores API completo; cierre efectivo al mergear PR #81. Frontend CI `35386101873` aprobó Node `v22.23.2`, build, 64 archivos/296 tests y lint; Backend CI `35386101857` SUCCESS. QA manual: NOT RUN.
- Resources y Rate Plans usan contratos reales; Revenue, Occupancy y Reservations usan el Dashboard backend real.
- Los widgets Dashboard sin contrato backend aprobado fueron retirados del MVP; no se muestran datos ficticios.
- FE-IAM-003 — Session Persistence, FE-IAM-004 — Refresh Token Rotation, FE-IAM-005 — Logout y FE-IAM-006 — Protected Routes están Completed.
- FE-IAM-001 — Login cumple sus criterios funcionales: valida credenciales, establece sesión en éxito, conserva el destino privado seguro mediante `PublicRoute`, presenta loading y errores contractuales, y permite reintentar. Se completó cobertura de validación, envío duplicado, errores, reintento y API en `feature/fe-iam-001-complete-login`; su cierre documental es efectivo en `develop` al mergear esa PR. Frontend CI `35382260589` aprobó el feature HEAD `bd6e6b00e0f0160a3c61641ce322d9428201ffb4` (Node `v22.23.2`, 64 archivos/273 tests, lint y build PASS); Backend CI `35382260648` SUCCESS. QA manual de navegador: `NOT RUN`.
- FE-IAM-005 usa el refresh token vigente, revoca remotamente en best effort, limpia sesión/storage/cache de inmediato y evita que refreshes tardíos restauren la sesión. Validación automatizada Node 22: 59 archivos y 225 tests PASS, lint PASS y build PASS; validación manual de revocación en navegador no ejecutada.
- FE-IAM-006 protege centralmente `/app`, conserva deep links internos seguros, evita contenido privado durante restauración y retira el árbol privado al perder la sesión. La implementación original corresponde a PR #73; PR #79 agrega validación estricta de `next`, elimina la navegación post-login competidora y añade Frontend CI. Evidencia: run `35378595452`, Node `v22.23.2`, build PASS, 63 archivos/261 tests PASS y lint PASS. El cierre queda efectivo al merge; QA manual de navegador permanece `NOT RUN`.
- FE-IAM-003 fue validada con F5, `sessionStorage`, refresh rotatorio y reanudación del Dashboard.
- La quality gate frontend usa Node 22: 59 archivos y 225 tests PASS; `npm run lint` PASS con alcance explícito a `src`, `tests` y `vite.config.ts`; build PASS.
- Los widgets Dashboard sin contrato backend fueron retirados del MVP; no hay mocks operativos visibles.

Siguiente decisión pendiente: confirmar o cambiar el nombre/cupo provisional TOP Inicial / 10 Resources de FE-SUB-001 antes de producción. No hay historias frontend Planned restantes. La integración de la cadena corresponde a un merge humano; el MVP final no se declara cerrado mientras persista esa decisión comercial pendiente.

## Contratos que impactan Frontend

Swagger:
- `/api/docs`

Identity & Access:
- IAM-008 está completada y no agrega endpoint: backend aplica una policy estática Role → Capability con default deny y Membership vigente por Business.
- Los Roles tenant-scoped no autorizan operaciones GLOBAL; Create Business, Create User y Disable User quedan fail-closed hasta definir Platform Authority.
- Cambios de autorización para frontend: RECEPTIONIST pierde mutaciones de Resources, Pricing y Availability Rules; ADMIN pierde Business Archive y asignación de OWNER; VIEWER puede ejecutar el cálculo estándar de Pricing sin efectos.
- `PATCH /api/users/:userId` permite al User `ACTIVE` actualizar únicamente su propio email; el `JWT sub` debe coincidir con `userId`.
- El cambio normaliza el email y conserva password, status, Memberships, Roles y sesiones; otro User recibe `403`, email duplicado `409` y body inválido `400`.
- Login conserva una lista de membresías con `{ businessId, role }`.
- Roles disponibles: `OWNER`, `ADMIN`, `RECEPTIONIST` y `VIEWER`.
- El JWT continúa siendo identity-only: el rol no se congela en claims y backend resuelve la membresía vigente.
- `VIEWER` es read-only; backend permanece como autoridad de autorización.
- IAM-007 no agrega API de Roles ni endpoint para modificar el rol.
- Breaking change: no.

Booking Lifecycle actual:
- `POST /api/businesses/:businessId/bookings`
- `GET /api/businesses/:businessId/bookings`
- `GET /api/businesses/:businessId/bookings/:bookingId`
- `PATCH /api/businesses/:businessId/bookings/:bookingId`
- `POST /api/businesses/:businessId/bookings/:bookingId/submit`
- `POST /api/businesses/:businessId/bookings/:bookingId/confirm`
- `POST /api/businesses/:businessId/bookings/:bookingId/cancel`
- `GET /api/businesses/:businessId/bookings/:bookingId/timeline`

Booking Timeline:
- Auth: `Authorization: Bearer <token>`.
- Path: `businessId`, `bookingId`.
- Query: `cursor?` opaco y `limit?` entre 1 y 50; default 50.
- Response: `items` con `id`, `type`, `occurredAt`, `actor` (`{ userId }` o `null`) y `details`; `pageInfo` contiene `nextCursor` y `hasNextPage`.
- Eventos: `BOOKING_CREATED`, `BOOKING_SUBMITTED`, `BOOKING_CONFIRMED`, `BOOKING_CANCELLED`.
- Cancel admite `reason` opcional en `details`; no existe backfill para Bookings anteriores a BKG-006.
- Breaking change: no.

Payment Plan (PAY-002):
- `POST /api/businesses/:businessId/bookings/:bookingId/payment-plan`
- `GET /api/businesses/:businessId/bookings/:bookingId/payment-plan`
- `PUT /api/businesses/:businessId/bookings/:bookingId/payment-plan`
- El plan usa total y moneda del PricingSnapshot, aplica Payments automáticamente y no modifica Booking ni PricingSnapshot.
- Breaking change: no; agrega endpoints y persistencia.

Outstanding Balance (PAY-004):
- `GET /api/businesses/:businessId/bookings/:bookingId/outstanding-balance`
- Expone por Booking total, pagado, pendiente, vencido, estado financiero y próximo vencimiento derivados; no persiste un segundo saldo mutable.
- Usa `payment.read`, funciona sin PaymentPlan cuando existe PricingSnapshot y conserva lectura histórica tenant-scoped.
- Breaking change: no; agrega un endpoint read-only.

Payment History (PAY-003):
- `GET /api/businesses/:businessId/bookings/:bookingId/payments`
- Usa `payment.read` y devuelve `items` más `pageInfo` con paginación por cursor opaco, límite máximo 50 y los eventos financieros más recientes primero.
- Expone únicamente los campos públicos de Payment, permite lectura histórica y no documenta la estructura interna del cursor como contrato para Frontend.
- Breaking change: no; agrega lectura paginada sobre la colección existente de Payments.

Occupancy KPI (DSH-002):
- La proyección backend interna está completada y se expone mediante DSH-001 — Business Dashboard.
- No agrega endpoint público ni `dashboard.read` en esta historia.

Revenue KPI (DSH-003 — Completed):
- Proyección backend interna de Payments `RECORDED` por `paidAt`, dentro de un período `[from, to)` de hasta 31 días en la timezone del Business.
- Devuelve `currency` y `amountMinor`; no filtra por estado de Booking, no usa PricingSnapshot y no realiza FX.
- No agrega endpoint público propio; DSH-001 la expone mediante `dashboard.read`.
- Breaking change: no.

Reservations KPI (DSH-004 — Completed):
- Proyección backend interna de Bookings creadas por `createdAt` dentro de un período `[from, to)` de hasta 31 días en la timezone del Business.
- Devuelve `total` y los siete estados actuales, incluidos los que tengan valor cero; una Booking multi-resource cuenta una sola vez.
- No usa check-in/check-out, Contact o Timeline para formar la cohorte y no reconstruye estado histórico.
- No agrega endpoint público propio; DSH-001 la expone mediante `dashboard.read`.

Business Dashboard (DSH-001 — Completed):
- `GET /api/businesses/:businessId/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- Compone `occupancy`, `revenue` y `reservations` para el mismo período Business-local `[from, to)` obligatorio de hasta 31 días.
- Usa `dashboard.read`, con scope BUSINESS para `OWNER`, `ADMIN`, `RECEPTIONIST` y `VIEWER`.
- La respuesta es all-or-nothing, permite lectura de Business archivado y no recalcula ni persiste métricas.
- Breaking change: no; agrega el único contrato HTTP público del bloque Dashboard.

Rate Plan Read para integración frontend:
- `GET /api/businesses/:businessId/rate-plans` usa `pricing.read` y devuelve `RatePlanResponseDto[]`.
- Sin filtros entrega el catálogo tenant-scoped, incluidos planes activos y archivados, en orden `name ASC, id ASC`.
- Con `resourceId`, `checkIn` y `checkOut` enviados conjuntamente entrega solo planes activos, asignados y vigentes que backend considera seleccionables para el Resource y la estadía.
- Business archivado permite catálogo histórico, pero el modo de selección exige Business y Resource activos.
- Rate Plan Detail queda diferido; PricingSnapshot permanece interno y Booking Detail no cambia en el MVP.
- Desbloquea FE-PRI-001 y FE-BKG-006. Breaking change: no.

## Regla de coordinación Backend → Frontend

Cuando Backend modifica un contrato que consume Frontend, actualizar esta sección con:

- fecha;
- historia;
- endpoint;
- cambio;
- breaking change: sí/no;
- acción requerida en frontend.

## Cambios recientes relevantes para Frontend

- DSH-001 completado: el contrato backend del Dashboard está disponible con `from` y `to` obligatorios, respuesta `occupancy + revenue + reservations` y capability `dashboard.read`; no requiere cambios de semántica en los KPI internos ni completa por sí mismo el trabajo frontend.
- DSH-004 finalizado: existe la proyección interna de Reservations por cohorte de `Booking.createdAt` y estado actual; no agrega contrato HTTP ni requiere integración frontend hasta DSH-001.
- Pricing incorpora lectura de Rate Plans para catálogo y selección contextual de Booking; frontend ya no debe inferir estado, asignación ni vigencia. No se agrega Detail ni se expone PricingSnapshot.
- DSH-002 finalizado: existe la proyección interna de Occupancy sobre el inventario operacional actual; no agrega contrato HTTP ni requiere integración frontend hasta DSH-001.
- PAY-003 finalizado: nuevo GET paginado de Payment History por Booking con `payment.read`, respuesta `items + pageInfo`, campos públicos únicamente, lectura histórica y sin breaking change.
- PAY-004 finalizado: nuevo endpoint read-only de Outstanding Balance con `payment.read`; expone total, pagado, pendiente, vencido, estado financiero y próximo vencimiento derivados. Funciona sin PaymentPlan cuando existe PricingSnapshot y no introduce breaking change.
- PAY-002 finalizado: Payment Plan permite crear, consultar y reemplazar planes antes de la primera aplicación; los Payments se distribuyen automáticamente entre cuotas y los estados se derivan de montos, aplicaciones y vencimientos.
- IAM-008 finalizado: cambio de comportamiento de autorización, sin breaking change de schema. RECEPTIONIST conserva lecturas de Resources, operación de Booking, cancelación de Booking, Blocks y cálculo estándar de Pricing; no puede mutar Resources, Pricing ni Availability Rules, ni ejecutar Pricing override.
- ADMIN no puede archivar Business ni asignar OWNER; VIEWER permanece read-only por capability y puede ejecutar el cálculo estándar de Pricing sin efectos persistentes.
- Los Roles tenant-scoped no autorizan Create Business, Create User ni Disable User; estas operaciones GLOBAL permanecen fail-closed hasta definir Platform Authority.
- IAM-005 finalizado: Update User es self-service, acepta únicamente `email`, no invalida sesiones y no otorga autoridad global mediante Roles tenant-scoped; breaking change: no.
- IAM-007 finalizado: el catálogo de roles permanece tenant-scoped por Membership, Login conserva `businessId + role` y `VIEWER` queda limitado a lectura.
- BKG-006 finalizado: Booking expone Timeline paginado con cursor opaco y los cuatro eventos funcionales aprobados.
- Cancel acepta motivo opcional, visible únicamente en el evento de cancelación correspondiente.
- Confirm persiste PricingSnapshot.
- Availability considera Bookings, Blocks y reglas configurables.
- API disponible dentro del stack Docker.

## Decisiones / hallazgos pendientes

- **PAY-001 public response DTO:** corregido por PR `#84`, merge `749ac32`. `POST /api/businesses/:businessId/bookings/:bookingId/payments` responde solamente `id`, `bookingId`, `amountMinor`, `currency`, `method`, `reference`, `note`, `paidAt`, `createdAt`, `recordedByUserId` y `status`; no expone metadatos internos y conserva idempotencia, permisos y GET de PAY-003.

La revisión Swagger Jeni/Tobera puede generar:
- bugs;
- decisiones de seguridad;
- inconsistencias de API;
- capacidades faltantes;
- mejoras de documentación.

No implementar estos hallazgos hasta clasificarlos y aprobarlos.

### Subscription & Entitlements — implementación técnica completa, decisión comercial pendiente

Backend real y UI en perfil/alta de Resource implementados en `codex/subscription-entitlements`, dependiente de #92/#91/#90. TOP Inicial provisional: 10 operativos, enforcement atómico, lectura para miembros y solicitud única solo OWNER. Contratos/reglas/operación en Domain Bible, Business Rules y Architecture. Gates backend completos PASS (1517 pruebas de cobertura y 194 escenarios de aceptación); frontend 429 pruebas completas PASS más integración Auth de logout. QA Edge desktop/móvil emulado con API real, cupo 0/8/9/10 y aislamiento entre Businesses PASS. FE-SUB-001 es el único In Progress: implementación técnica completa; decisión comercial de nombre/cupo pendiente antes de producción. Recuento preparado al integrar la cadena: 52 activas, 51 Completed, 1 In Progress, 0 Planned y 0 Blocked. Quality gate resuelve bundle, escala PYG y fechas IANA de Calendar; evidencia final en #94. MVP final no cerrado por decisión comercial pendiente.
