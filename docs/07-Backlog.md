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

- **IAM-004 — Create User.** Estado: Planned. Dominio: Identity & Access. Prioridad: Alta. Endpoint: `POST /api/users` propuesto para habilitación posterior; el primer slice usa aprovisionamiento administrativo mediante script o seed. Pruebas obligatorias: unitarias, integración PostgreSQL, E2E, aceptación Gherkin, mutation testing y seguridad. Definition of Done: crea User `ACTIVE` y LocalCredential de forma atómica, normaliza y valida email, aplica política de contraseña, no expone datos sensibles y supera los controles vigentes. **Siguiente capacidad.**
- **IAM-009 — Manage User-Business Membership.** Estado: Planned. Dominio: Identity & Access. Prioridad: Alta. Endpoint: `POST /api/businesses/:businessId/memberships` propuesto. Pruebas obligatorias: unitarias, integración PostgreSQL, E2E, aceptación Gherkin, mutation testing y seguridad. Definition of Done: crea una membresía única User–Business con rol válido, valida ambas referencias, conserva aislamiento multi-tenant y no crea User, credenciales ni tokens.
- **IAM-007 — Roles.** Estado: Planned. Dominio: Identity & Access. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **IAM-001 — Login.** Estado: Planned. Dominio: Identity & Access. Prioridad: Alta. Endpoint: `POST /api/auth/login`. Pruebas obligatorias: según convención. Definition of Done: según convención. Depende de User, membresías y roles.
- **IAM-003 — Refresh Token.** Estado: Planned. Dominio: Identity & Access. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **IAM-002 — Logout.** Estado: Planned. Dominio: Identity & Access. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **IAM-006 — Disable User.** Estado: Planned. Dominio: Identity & Access. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **IAM-005 — Update User.** Estado: Planned. Dominio: Identity & Access. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **IAM-008 — Permissions.** Estado: Planned. Dominio: Identity & Access. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

## Resource

- **RES-001 — Create Resource.** Estado: Planned. Dominio: Resource. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **RES-002 — Get Resource.** Estado: Planned. Dominio: Resource. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **RES-003 — List Resources.** Estado: Planned. Dominio: Resource. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **RES-004 — Update Resource.** Estado: Planned. Dominio: Resource. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **RES-005 — Disable Resource.** Estado: Planned. Dominio: Resource. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **RES-006 — Upload Images.** Estado: Planned. Dominio: Resource. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **RES-007 — Resource Amenities.** Estado: Planned. Dominio: Resource. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

## Pricing

- **PRI-001 — Create Rate Plan.** Estado: Planned. Dominio: Pricing. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **PRI-002 — Update Rate Plan.** Estado: Planned. Dominio: Pricing. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **PRI-003 — Seasonal Pricing.** Estado: Planned. Dominio: Pricing. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **PRI-004 — Manual Price Override.** Estado: Planned. Dominio: Pricing. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **PRI-005 — Calculate Price.** Estado: Planned. Dominio: Pricing. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

## Availability

- **AVL-001 — Check Availability.** Estado: Planned. Dominio: Availability. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **AVL-002 — Availability Calendar.** Estado: Planned. Dominio: Availability. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **AVL-003 — Availability Rules.** Estado: Planned. Dominio: Availability. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **AVL-004 — Overbooking Validation.** Estado: Planned. Dominio: Availability. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

## Contact

- **CON-001 — Create Contact.** Estado: Planned. Dominio: Contact. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **CON-002 — Get Contact.** Estado: Planned. Dominio: Contact. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **CON-003 — Search Contact.** Estado: Planned. Dominio: Contact. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **CON-004 — Update Contact.** Estado: Planned. Dominio: Contact. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

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

- **BLK-001 — Create Block.** Estado: Planned. Dominio: Block. Prioridad: Alta. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **BLK-002 — Remove Block.** Estado: Planned. Dominio: Block. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **BLK-003 — List Blocks.** Estado: Planned. Dominio: Block. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

## Dashboard

- **DSH-001 — Business Dashboard.** Estado: Planned. Dominio: Dashboard. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **DSH-002 — Occupancy KPI.** Estado: Planned. Dominio: Dashboard. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **DSH-003 — Revenue KPI.** Estado: Planned. Dominio: Dashboard. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.
- **DSH-004 — Reservations KPI.** Estado: Planned. Dominio: Dashboard. Prioridad: Media. Endpoint: Pendiente de definición. Pruebas obligatorias: según convención. Definition of Done: según convención.

## Progreso por épica

| Épica | Total | Completed | In Progress | Planned | Blocked |
| --- | ---: | ---: | ---: | ---: | ---: |
| Business | 5 | 5 | 0 | 0 | 0 |
| Identity & Access | 9 | 0 | 0 | 9 | 0 |
| Resource | 7 | 0 | 0 | 7 | 0 |
| Pricing | 5 | 0 | 0 | 5 | 0 |
| Availability | 4 | 0 | 0 | 4 | 0 |
| Contact | 4 | 0 | 0 | 4 | 0 |
| Booking | 6 | 0 | 0 | 6 | 0 |
| Payment | 4 | 0 | 0 | 4 | 0 |
| Block | 3 | 0 | 0 | 3 | 0 |
| Dashboard | 4 | 0 | 0 | 4 | 0 |
| **Total** | **51** | **5** | **0** | **46** | **0** |

Progreso general del MVP: 5 de 51 capacidades completadas (9,8%).
