# TOP — Estado actual y handoff

Última actualización: 2026-09-20

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

Estado:
- FE-FND-009 — In Progress. Mínimo C aprobado: backend Search limitado y tenant-scoped más integración frontend. Contrato y pruebas en la [PR draft #83](https://github.com/Manuetg/TOP-Platform/pull/83), rama `feature/fe-fnd-009-global-search`, base `3ebaf021ce25937e111c8d099762aa6e33761a18`. Runs y SHA final comprobado en el cuerpo de la PR; tests/lint/build ejecutados solo por CI. Corrección acotada de foco en reintento/Escape, cubierta con foco real en jsdom y respuestas diferidas; sin recuperación tardía. Self-review, sin revisión independiente. QA manual móvil/desktop NOT RUN: frontend/API no disponibles en localhost:3001/3000; navegador/viewport no ejecutados. Cierre por DoD pendiente, sin merge. Extensión expresamente autorizada, sin alterar el baseline histórico backend 53/53.
- Dashboard Business implementado y mergeado en `/app`.
- FE-DSH-001 — Completed.
- FE-BUS-001 — Completed; las siete features tenant-scoped consumen Active Business Context y el ciclo de vida está cubierto por tests.
- FE-FND-004 — Completed preparado, efectivo en `develop` al mergear PR #82. Boundary de contenido bajo ProtectedRoute/BusinessBoundary conserva shell, cuenta, Auth y QueryClient; reintento local y cambio de ruta/identidad/Business recuperan la vista sin reproducir mutations. Respaldo de shell/router y boundary exterior de providers sin dependencias de contexto, con inicio/recarga de documento. FE-FND-003 mantiene errores API locales; no se capturan por sí solos eventos o promesas fuera del árbol React. Frontend CI `35473054747` SUCCESS (Node `v22.23.2`, build, 67 archivos/317 tests, lint); Backend CI `35473054790` SUCCESS. Self-review sin bloqueantes y diff check PASS. HEAD/checkout finales en el cuerpo de la misma PR. QA manual móvil/desktop: NOT RUN; mutation diferida. Backend y trabajo de Manu sin cambios.
- FE-FND-003 — manejo compartido de errores API completo; cierre efectivo al mergear PR #81. Frontend CI `35386101873` aprobó Node `v22.23.2`, build, 64 archivos/296 tests y lint; Backend CI `35386101857` SUCCESS. QA manual: NOT RUN.
- 43/51 historias frontend activas Completed; 1 In Progress, 6 Planned y 1 Blocked.
- Resources y Rate Plans usan contratos reales; Revenue, Occupancy y Reservations usan el Dashboard backend real.
- Los widgets Dashboard sin contrato backend aprobado fueron retirados del MVP; no se muestran datos ficticios.
- FE-IAM-003 — Session Persistence, FE-IAM-004 — Refresh Token Rotation, FE-IAM-005 — Logout y FE-IAM-006 — Protected Routes están Completed.
- FE-IAM-001 — Login cumple sus criterios funcionales: valida credenciales, establece sesión en éxito, conserva el destino privado seguro mediante `PublicRoute`, presenta loading y errores contractuales, y permite reintentar. Se completó cobertura de validación, envío duplicado, errores, reintento y API en `feature/fe-iam-001-complete-login`; su cierre documental es efectivo en `develop` al mergear esa PR. Frontend CI `35382260589` aprobó el feature HEAD `bd6e6b00e0f0160a3c61641ce322d9428201ffb4` (Node `v22.23.2`, 64 archivos/273 tests, lint y build PASS); Backend CI `35382260648` SUCCESS. QA manual de navegador: `NOT RUN`.
- FE-IAM-005 usa el refresh token vigente, revoca remotamente en best effort, limpia sesión/storage/cache de inmediato y evita que refreshes tardíos restauren la sesión. Validación automatizada Node 22: 59 archivos y 225 tests PASS, lint PASS y build PASS; validación manual de revocación en navegador no ejecutada.
- FE-IAM-006 protege centralmente `/app`, conserva deep links internos seguros, evita contenido privado durante restauración y retira el árbol privado al perder la sesión. La implementación original corresponde a PR #73; PR #79 agrega validación estricta de `next`, elimina la navegación post-login competidora y añade Frontend CI. Evidencia: run `35378595452`, Node `v22.23.2`, build PASS, 63 archivos/261 tests PASS y lint PASS. El cierre queda efectivo al merge; QA manual de navegador permanece `NOT RUN`.
- FE-IAM-003 fue validada con F5, `sessionStorage`, refresh rotatorio y reanudación del Dashboard.
- La quality gate frontend usa Node 22: 59 archivos y 225 tests PASS; `npm run lint` PASS con alcance explícito a `src`, `tests` y `vite.config.ts`; build PASS.
- Los widgets Dashboard sin contrato backend fueron retirados del MVP; no hay mocks operativos visibles.

Siguiente objetivo: continuar con las historias frontend Planned restantes. El frontend MVP no se declara completo.

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

- **PAY-001 public response DTO:** `POST /api/businesses/:businessId/bookings/:bookingId/payments` retorna actualmente el tipo interno `Payment` y puede exponer `businessId`, `idempotencyKey` y `requestFingerprint`. Evaluar en una futura clasificación si corresponde introducir un DTO público, considerando alcance, compatibilidad y prioridad. PAY-003 no modificó este contrato y el hallazgo no crea una capacidad nueva.

La revisión Swagger Jeni/Tobera puede generar:
- bugs;
- decisiones de seguridad;
- inconsistencias de API;
- capacidades faltantes;
- mejoras de documentación.

No implementar estos hallazgos hasta clasificarlos y aprobarlos.
