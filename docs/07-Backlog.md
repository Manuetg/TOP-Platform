# TOP — Backlog del MVP

## Convenciones

Estados permitidos: Planned, In Progress, Completed y Blocked.

Pruebas obligatorias: unitarias, integración, E2E y aceptación, según aplique al tipo de capacidad. Definition of Done resumida: implementación revisada, reglas en backend, aislamiento por Negocio cuando aplique, pruebas obligatorias aprobadas, cobertura y controles de calidad vigentes superados, y documentación relacionada actualizada cuando corresponda.

Los endpoints no definidos expresamente se marcan como **Pendiente de definición**.

## Business

- **BUS-001 — Create Business.** Estado: Completed. Dominio: Business. Prioridad: Alta. Endpoint: `POST /api/businesses`. Pruebas obligatorias: unitarias, integración, E2E y aceptación. Definition of Done: aplicada.
- **BUS-002 — Get Business by Id.** Estado: Completed. Dominio: Business. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **BUS-003 — List Businesses.** Estado: Completed. Dominio: Business. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **BUS-004 — Update Business.** Estado: Completed. Dominio: Business. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **BUS-005 — Archive Business.** Estado: Completed. Dominio: Business. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

Progreso de Business: 5 de 5 capacidades completadas (100%).

## Identity & Access

IAM-004 y IAM-009 son las capacidades fundacionales de Identity & Access. Se implementan antes de Login para evitar una dependencia circular de autorización.

Secuencia ejecutable: IAM-004, IAM-009, IAM-007 si requiere implementación adicional, IAM-001, protección progresiva de endpoints administrativos, IAM-003, IAM-002, IAM-006, IAM-005 e IAM-008.

- **IAM-004 — Create User.** Estado: Completed. Dominio: Identity & Access. Prioridad: Alta. Endpoint: `POST /api/users` propuesto para habilitación posterior; el primer slice usa aprovisionamiento administrativo mediante script o seed. Pruebas obligatorias: unitarias, integración PostgreSQL, E2E, aceptación Gherkin, mutation testing y seguridad. Definition of Done: crea User `ACTIVE` y LocalCredential de forma atómica, normaliza y valida email, aplica política de contraseña, no expone datos sensibles y supera los controles vigentes.
- **IAM-009 — Manage User-Business Membership.** Estado: Completed. Dominio: Identity & Access. Prioridad: Alta. Endpoint: `POST /api/businesses/:businessId/memberships` propuesto. Pruebas obligatorias: unitarias, integración PostgreSQL, E2E, aceptación Gherkin, mutation testing y seguridad. Definition of Done: aplicada. Evidencia técnica: commit `fe0998b`; quality check, integración PostgreSQL, E2E y aceptación aprobados; mutation score general 87.40% e Identity 84.26%. La confirmación de GitHub Actions para `fe0998b` está **Pendiente de confirmación manual**.
- **IAM-007 — Roles.** Estado: Planned. Dominio: Identity & Access. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **IAM-001 — Login.** Estado: Completed. Dominio: Identity & Access. Prioridad: Alta. Endpoint: `POST /api/auth/login`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Depende de User, membresías y roles. Evidencia técnica: commit `81560013`; Login mediante JWT Bearer con expiración de 900 segundos; quality check aprobado; mutation score general 85.10%, Identity 81.99% y LoginUseCase 98.21%; arquitectura sin violaciones.
- **IAM-003 — Refresh Token.** Estado: Completed. Dominio: Identity & Access. Prioridad: Alta. Endpoint: `POST /api/auth/refresh`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `ec9347da`; refresh token opaco de 256 bits con hash SHA-256 persistido, rotación atómica y reutilización rechazada; Login entrega el refresh token inicial; TTL de 2.592.000 segundos; migración `20260804000000_add_refresh_session`; quality check aprobado; mutation score general 86.95%, Identity 85.57% y RefreshTokenUseCase 96.97%; arquitectura sin violaciones.
- **IAM-002 — Logout.** Estado: Completed. Dominio: Identity & Access. Prioridad: Media. Endpoint: `POST /api/auth/logout`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `2c44e78`; respuesta `204 No Content` idempotente para tokens activos, inexistentes, expirados, rotados o revocados; request inválido devuelve `400`; revocación por hash SHA-256 sin afectar otras sesiones ni access tokens; quality check, integración PostgreSQL, E2E, mutation testing y Prisma aprobados; arquitectura sin violaciones.
- **IAM-006 — Disable User.** Estado: Completed. Dominio: Identity & Access. Prioridad: Media. Endpoint: `PATCH /api/users/:id/disable`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `046ae17`; transición de `ACTIVE` a `DISABLED` idempotente; Login y Refresh posteriores rechazados con `403`; sin migración nueva; unit 24 suites y 94 tests, integración 8 suites y 24 tests, E2E 5 suites y 47 tests, aceptación 32 escenarios y 139 steps; cobertura: líneas 97,67%, statements 97,06%, funciones 97,94% y branches 89,09%; mutation score general 87,97%, Identity 87,21% y DisableUserUseCase 92,31%; arquitectura sin violaciones y Prisma válido.
- **IAM-005 — Update User.** Estado: Planned. Dominio: Identity & Access. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **IAM-008 — Permissions.** Estado: Planned. Dominio: Identity & Access. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

## Resource

- **RES-001 — Create Resource.** Estado: Completed. Dominio: Resource. Prioridad: Alta. Endpoint: `POST /api/businesses/:businessId/resources`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `d771f46`; migración `20260804193112_create_resource`; quality check aprobado; mutation score general 87,73%; Swagger manual validado.
- **RES-002 — Get Resource.** Estado: Completed. Dominio: Resource. Prioridad: Alta. Endpoint: `GET /api/businesses/:businessId/resources/:resourceId`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `df14b1e`; unit 28 suites y 113 tests, integración 9 suites y 27 tests, E2E 6 suites y 58 tests, aceptación 34 escenarios y 146 pasos; cobertura: líneas 96,39%, statements 95,17%, funciones 96,23% y branches 83,23%; arquitectura sin violaciones y Prisma válido; mutation segmentada: GetResourceUseCase 93,55% (31 mutantes), PrismaResourceRepository 100% (11 mutantes) y ResourceController 88% (25 mutantes); Swagger manual validado con 200 para Resource existente, 400 para UUID inválido, 404 para Resource inexistente y respuesta sin `props`. El último score global válido conocido se mantiene en 87,73%.
- **RES-003 — List Resources.** Estado: Completed. Dominio: Resource. Prioridad: Alta. Endpoint: `GET /api/businesses/:businessId/resources`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `5c649ef`; orden `sortOrder ASC`, `name ASC`, `id ASC`; lista vacía `200 []`; incluye Resources `ACTIVE`, `OUT_OF_SERVICE` y `ARCHIVED`, permite Business archivado y mantiene aislamiento por `businessId`; unit 31 suites y 135 tests, integración 9 suites y 28 tests, E2E 6 suites y 59 tests, aceptación 36 escenarios y 154 pasos; cobertura: líneas 97,70%, statements 96,51%, funciones 97,91% y branches 87,71%; arquitectura sin violaciones y Prisma válido; mutation segmentada: ListResourcesUseCase 100%, PrismaResourceRepository 100% y ResourceController 96,97%; Swagger/HTTP manual validado; GitHub Actions run `30954710356` con `verify: success`. El último score global completo de mutation conocido se mantiene en 87,73%.
- **RES-004 — Update Resource.** Estado: Completed. Dominio: Resource. Prioridad: Alta. Endpoint: `PATCH /api/businesses/:businessId/resources/:resourceId`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `79e9bf5`; actualización parcial de campos aprobados, normalización de nombre y código interno, descripción nula o vacía persistida como `null`, y capacidades validadas sobre el estado final; bloquea Business y Resource archivados, permite Resource `OUT_OF_SERVICE` y mantiene aislamiento por `businessId`; unit 32 suites y 193 tests, integración 9 suites y 28 tests, E2E 6 suites y 66 tests, aceptación 36 escenarios y 154 pasos; cobertura: líneas 97,90%, statements 96,77%, funciones 98,07% y branches 90,17%; arquitectura sin violaciones y Prisma válido; mutation segmentada: UpdateResourceUseCase 93,64%, PrismaResourceRepository 100%, ResourceController 98% y Resource entity 100%; Swagger/HTTP manual validado; GitHub Actions run `30960261669` con `verify: success`. El último score global completo de mutation conocido se mantiene en 87,73%.
- **RES-005 — Disable Resource.** Estado: Completed. Dominio: Resource. Prioridad: Media. Endpoint: `PATCH /api/businesses/:businessId/resources/:resourceId/disable`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `dc0a50e`; transición `ACTIVE` a `OUT_OF_SERVICE` idempotente, bloqueo de Resource y Business archivados, aislamiento por `businessId` y preservación de atributos; defectos de routing y persistencia de `status` corregidos y protegidos; unit 33 suites y 201 tests, integración 9 suites y 29 tests, E2E 6 suites y 67 tests, aceptación 39 escenarios y 167 pasos; cobertura: statements 96,80%, branches 90,94%, funciones 98,12% y líneas 97,85%; quality check, Prisma y arquitectura sin violaciones aprobados; mutation segmentada: DisableResourceUseCase 95,35%, Resource entity 100% y ResourceController 82,54%; Swagger/HTTP manual validado; GitHub Actions run `31454662102` con `verify: success`. El último score global completo de mutation conocido se mantiene en 87,73%.
- **RES-006 — Upload Images.** Estado: Completed. Dominio: Resource. Prioridad: Media. Endpoint: `POST /api/businesses/:businessId/resources/:resourceId/images`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `db06772`; carga `multipart/form-data` de JPEG, PNG y WEBP con límite de 5 MB y máximo de 10 imágenes, `sortOrder` automático, metadata `ResourceImage`, almacenamiento S3-compatible privado y URL firmada temporal; mantiene aislamiento por `businessId`, permite Resource `OUT_OF_SERVICE` y bloquea Business y Resource archivados; unit 38 suites y 240 tests, integración 10 suites y 30 tests, E2E 6 suites y 68 tests, aceptación 44 escenarios y 196 pasos; cobertura: statements 97,08%, branches 91,87%, funciones 98,36% y líneas 98,00%; arquitectura sin violaciones, Prisma y quality check aprobados; mutation segmentada: UploadResourceImageUseCase 100% (87/87), PrismaResourceImageRepository 100% (15/15), S3FileStorage 100% (35/35) y ResourceController 85,37%; Swagger/HTTP manual validado; GitHub Actions run `31623999986` con `verify: success`. El último score global completo de mutation conocido se mantiene en 87,73%.
- **RES-007 — Resource Amenities.** Estado: Completed. Dominio: Resource. Prioridad: Media. Endpoint: `GET /api/amenities` y `PUT /api/businesses/:businessId/resources/:resourceId/amenities`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `a61373c`; catálogo global de 18 amenities seed, reemplazo completo idempotente, array vacío y validación de duplicados; aislamiento por `businessId`, bloqueo de Business/Resource archivados y amenities inactivas, con Resource `OUT_OF_SERVICE` permitido; unit 43 suites y 270 tests, integración 11 suites y 31 tests, E2E 6 suites y 69 tests, aceptación 45 escenarios y 200 pasos; cobertura: statements 97,27%, branches 92,28%, funciones 98,24% y líneas 98,13%; quality check, Prisma y arquitectura sin violaciones aprobados; mutation segmentada: ListAmenitiesUseCase 100%, SetResourceAmenitiesUseCase >=90%, PrismaAmenityRepository 100%, PrismaResourceAmenityRepository 100%, AmenityController 100% y ResourceController RES-007 93,75%; Swagger/HTTP manual validado; GitHub Actions run `31640435710` con `verify: success`. El último score global completo de mutation conocido se mantiene en 87,73%.

## Pricing

- **PRI-001 — Create Rate Plan.** Estado: Completed. Dominio: Pricing. Prioridad: Alta. Endpoint: `POST /api/businesses/:businessId/rate-plans`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `640ab50`; migración `20260813004610_create_rate_plans`; tarifa base `baseNightlyAmountMinor` positiva, moneda `PYG` derivada del Business, vigencia semiabierta `[validFrom, validTo)`, asignación opcional a 0..N Resources y persistencia atómica; validaciones HTTP manuales 201, 400, 404 y 409, incluyendo Business/Resource archivados y ausencia de persistencia parcial; quality gates aprobados; mutation segmentada: CreateRatePlanUseCase 93,79%, PrismaRatePlanRepository 89,66% y PricingController 100%; GitHub Actions run `31657454313` con `verify: success`.
- **PRI-002 — Update Rate Plan.** Estado: Completed. Dominio: Pricing. Prioridad: Alta. Endpoint: `PATCH /api/businesses/:businessId/rate-plans/:ratePlanId`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `03e7494`; actualización parcial de nombre, descripción, importe base, vigencia y Resources; `null` limpia descripción y límites de vigencia, `resourceIds` omitido preserva relaciones, presente las reemplaza y `[]` las elimina; aislamiento por tenant, bloqueo de Business, RatePlan y Resource archivados, `OUT_OF_SERVICE` permitido y persistencia atómica con rollback confirmado; unit 48 suites y 334 tests, integración 12 suites y 35 tests, E2E 7 suites y 79 tests, aceptación 55 escenarios y 239 pasos; cobertura: statements 97,71%, branches 94,17%, funciones 98,26% y líneas 98,26%; quality check, Prisma y arquitectura sin violaciones aprobados; mutation segmentada: UpdateRatePlanUseCase 94,90%, PrismaRatePlanRepository 95,71% y PricingController 100%; Swagger/HTTP manual validado; GitHub Actions run `31762428672` con `verify: success`. El último score global completo de mutation conocido se mantiene en 87,73%.
- **PRI-003 — Seasonal Pricing.** Estado: Completed. Dominio: Pricing. Prioridad: Alta. Endpoint: `POST` y `GET /api/businesses/:businessId/rate-plans/:ratePlanId/seasonal-rates`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `1c2064d`; entidad SeasonalRate con intervalo semiabierto `[startDate, endDate)`, containment dentro de la vigencia de la tarifa, sin solapamiento y contigüidad permitida; aislamiento por tenant, constraint PostgreSQL con `btree_gist`, concurrencia real protegida e invariante de PRI-002 que impide excluir temporadas al reducir vigencia; unit 51 suites y 383 tests, integración 13 suites y 39 tests, E2E 7 suites y 87 tests, aceptación 64 escenarios y 273 pasos; cobertura: sentencias 97,81%, ramas 94,81%, funciones 98,42% y líneas 98,32%; arquitectura sin violaciones, Prisma y quality check aprobados; mutation segmentada: CreateSeasonalRateUseCase 93,85%, ListSeasonalRatesUseCase 96,77%, PrismaSeasonalRateRepository 94,52%, UpdateRatePlanUseCase 95,48% y PricingController 93,88%; CI run `31977875655` con `verify: success`. El último score global completo de mutation conocido se mantiene en 87,73%.
- **PRI-004 — Manual Price Override.** Estado: Completed. Dominio: Pricing. Prioridad: Alta. Endpoint: `POST /api/businesses/:businessId/rate-plans/:ratePlanId/calculate/override`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `b1139f9`; override transitorio del total acordado que recalcula server-side mediante `CalculatePriceUseCase`, sin persistencia; conserva el desglose sugerido y aplica importe acordado, ajuste y motivo obligatorio; unit 54 suites y 434 tests, integración 13 suites y 40 tests, E2E 7 suites y 107 tests, aceptación 67 escenarios y 284 pasos; cobertura: statements 98,03%, branches 95,18%, funciones 98,53% y líneas 98,56%; arquitectura sin violaciones; mutation segmentada: ApplyManualPriceOverrideUseCase 92,31% y PricingController 92,86%; GitHub Actions con `verify: success`.
- **PRI-005 — Calculate Price.** Estado: Completed. Dominio: Pricing. Prioridad: Alta. Endpoint: `POST /api/businesses/:businessId/rate-plans/:ratePlanId/calculate`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commit `96cbc39`; cálculo read-only por estadía semiabierta `[checkIn, checkOut)` con máximo de 365 noches, tarifa `BASE` o `SEASONAL`, breakdown nocturno y total exacto en `amountMinor`; aislamiento por tenant, RatePlan asignado al Resource, bloqueo de estados operativos y de vigencia de la tarifa, query de SeasonalRates sin N+1; HTTP/Swagger manual validado; mutation segmentada: CalculatePriceUseCase 93,75%, PricingCalculator 92,31%, repositorios 96,30% y PricingController 100%; GitHub Actions run `31985244125` con `verify: success`. El último score global completo de mutation conocido se mantiene en 87,73%.

## Availability

- **AVL-001 — Check Availability.** Estado: Planned. Dominio: Availability. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **AVL-002 — Availability Calendar.** Estado: Planned. Dominio: Availability. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **AVL-003 — Availability Rules.** Estado: Planned. Dominio: Availability. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **AVL-004 — Overbooking Validation.** Estado: Planned. Dominio: Availability. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

## Contact

- **CON-001 — Create Contact.** Estado: Completed. Dominio: Contact. Prioridad: Alta. Endpoint: `POST /api/businesses/:businessId/contacts`. Pruebas obligatorias: según convención. Definition of Done: aplicada.
- **CON-002 — Get Contact.** Estado: Completed. Dominio: Contact. Prioridad: Alta. Endpoint: `GET /api/businesses/:businessId/contacts/:contactId`. Pruebas obligatorias: según convención. Definition of Done: aplicada.
- **CON-003 — Search Contact.** Estado: Completed. Dominio: Contact. Prioridad: Alta. Endpoint: `GET /api/businesses/:businessId/contacts`. Pruebas obligatorias: según convención. Definition of Done: aplicada.
- **CON-004 — Update Contact.** Estado: Completed. Dominio: Contact. Prioridad: Media. Endpoint: `PATCH /api/businesses/:businessId/contacts/:contactId`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commits `9be931b`, `5482cd2` y `6c26d63`; unit 57 suites y 456 tests, integración 14 suites y 42 tests, E2E 8 suites y 114 tests, aceptación 69 escenarios y 296 pasos; cobertura: statements 97,77%, branches 93,54%, funciones 98,68% y líneas 98,72%; arquitectura sin violaciones; mutation de Contact 81,39% total y 85,11% covered; GitHub Actions con `verify: success`.

## Booking

- **BKG-001 — Create Booking.** Estado: Planned. Dominio: Booking. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **BKG-002 — Get Booking.** Estado: Planned. Dominio: Booking. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **BKG-003 — List Bookings.** Estado: Planned. Dominio: Booking. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **BKG-004 — Update Booking.** Estado: Planned. Dominio: Booking. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **BKG-005 — Cancel Booking.** Estado: Planned. Dominio: Booking. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **BKG-006 — Booking Timeline.** Estado: Planned. Dominio: Booking. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

## Payment

- **PAY-001 — Register Payment.** Estado: Planned. Dominio: Payment. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **PAY-002 — Payment Plan.** Estado: Planned. Dominio: Payment. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **PAY-003 — Payment History.** Estado: Planned. Dominio: Payment. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **PAY-004 — Outstanding Balance.** Estado: Planned. Dominio: Payment. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

## Block

- **BLK-001 — Create Block.** Estado: Completed. Dominio: Block. Prioridad: Alta. Endpoint: `POST /api/businesses/:businessId/resources/:resourceId/blocks`. Pruebas obligatorias: según convención. Definition of Done: aplicada.
- **BLK-002 — Remove Block.** Estado: Completed. Dominio: Block. Prioridad: Media. Endpoint: `PATCH /api/businesses/:businessId/blocks/:blockId/cancel`. Pruebas obligatorias: según convención. Definition of Done: aplicada.
- **BLK-003 — List Blocks.** Estado: Completed. Dominio: Block. Prioridad: Media. Endpoint: `GET /api/businesses/:businessId/blocks`. Pruebas obligatorias: según convención. Definition of Done: aplicada. Evidencia técnica: commits `3f22907`, `bb9f1b4`, `e77e108` y `c7d08ea`; Prisma, E2E, quality check, integración y aceptación aprobados; cobertura global: statements 97,90%, branches 93,77%, functions 99,00% y lines 98,79%; arquitectura sin violaciones; mutation: core application+domain 86,21%, `block.entity.ts` 100%, `PrismaBlockRepository` 100% y `BlockController` 81,48%.

Dependencia futura explícita: Availability deberá considerar conjuntamente Booking, Block y el estado operativo del Resource. La validación de conflictos Booking↔Block no está implementada todavía.

## Dashboard

- **DSH-001 — Business Dashboard.** Estado: Planned. Dominio: Dashboard. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **DSH-002 — Occupancy KPI.** Estado: Planned. Dominio: Dashboard. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **DSH-003 — Revenue KPI.** Estado: Planned. Dominio: Dashboard. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **DSH-004 — Reservations KPI.** Estado: Planned. Dominio: Dashboard. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

## Progreso por épica

| Épica | Total | Completed | In Progress | Planned | Blocked |
| --- | ---: | ---: | ---: | ---: | ---: |
| Business | 5 | 5 | 0 | 0 | 0 |
| Identity & Access | 9 | 6 | 0 | 3 | 0 |
| Resource | 7 | 7 | 0 | 0 | 0 |
| Pricing | 5 | 5 | 0 | 0 | 0 |
| Availability | 4 | 0 | 0 | 4 | 0 |
| Contact | 4 | 4 | 0 | 0 | 0 |
| Booking | 6 | 0 | 0 | 6 | 0 |
| Payment | 4 | 0 | 0 | 4 | 0 |
| Block | 3 | 3 | 0 | 0 | 0 |
| Dashboard | 4 | 0 | 0 | 4 | 0 |
| **Total** | **51** | **31** | **0** | **20** | **0** |

Progreso de Identity & Access: 6 de 9 capacidades completadas (66,7%).

Progreso de Resource: 7 de 7 capacidades completadas (100%).

Progreso de Pricing: 5 de 5 capacidades completadas (100%).

Progreso de Contact: 4 de 4 capacidades completadas (100%).

Progreso de Block: 3 de 3 capacidades completadas (100%).

Progreso general del MVP: 31 de 51 capacidades completadas (60,8%).
