# TOP — Estado actual y handoff

Última actualización: 2026-09-11

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
- DSH-003 — Revenue KPI — Completed

Estado del backlog backend del MVP:
- 51 / 53 capacidades completadas
- 96,2%

Booking:
- 6 / 6 completadas

Dashboard:
- 2 / 4 completadas (50%)

Capacidad backend actualmente en desarrollo:
- DSH-004 — Reservations KPI — In Progress.

Siguiente capacidad backend después del cierre de DSH-004:
- DSH-001 — Business Dashboard, agregador público final.

Validación de cambios backend:
- Backend CI en estado `SUCCESS` es obligatorio.
- Mientras `rolandobarros27` sea el único responsable backend, la revisión técnica se registra como `backend self-review documentada`, sin describirla como independiente.
- Una review externa se registra como tal únicamente cuando la realiza una persona con responsabilidad y capacidad técnica real sobre backend; no se aplican waivers automáticos.
- Mutation Testing se difiere al quality gate preproducción por su costo de ejecución; el requisito y sus umbrales permanecen vigentes.

Pendientes principales posteriores:
- Platform Administration / Global Authority pendiente de definición
- Dashboard

## Estado Frontend

Estado:
- Foundation existente localmente
- Login iniciado
- Integración backend iniciada
- Pendiente formalizar frontend dentro del flujo Git oficial

Siguiente objetivo:
1. revisar frontend existente;
2. estabilizar Foundation;
3. Authentication;
4. Business Context;
5. App Shell;
6. Resources;
7. Booking.

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
- La proyección backend interna está completada y será expuesta posteriormente mediante DSH-001 — Business Dashboard.
- No agrega endpoint público ni `dashboard.read` en esta historia.

Revenue KPI (DSH-003 — Completed):
- Proyección backend interna de Payments `RECORDED` por `paidAt`, dentro de un período `[from, to)` de hasta 31 días en la timezone del Business.
- Devuelve `currency` y `amountMinor`; no filtra por estado de Booking, no usa PricingSnapshot y no realiza FX.
- No agrega endpoint público ni `dashboard.read`; DSH-001 la expondrá posteriormente.
- Breaking change: no.

Reservations KPI (DSH-004 — In Progress):
- Proyección backend interna de Bookings creadas por `createdAt` dentro de un período `[from, to)` de hasta 31 días en la timezone del Business.
- Devuelve `total` y los siete estados actuales, incluidos los que tengan valor cero; una Booking multi-resource cuenta una sola vez.
- No usa check-in/check-out, Contact o Timeline para formar la cohorte y no reconstruye estado histórico.
- No agrega endpoint público ni `dashboard.read`; DSH-001 la expondrá posteriormente.

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
