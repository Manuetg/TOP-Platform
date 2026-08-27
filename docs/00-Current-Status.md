# TOP — Estado actual y handoff

Última actualización: 2026-08-26

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
- BKG-005 — Booking Lifecycle — Completed

Estado del MVP:
- 39 / 51 capacidades completadas
- 76,5%

Booking:
- 5 / 6 completadas

Siguiente capacidad backend prevista:
- BKG-006 — Booking Timeline

Pendientes principales posteriores:
- IAM restante
- Payment
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

Booking Lifecycle actual:
- `POST /api/businesses/:businessId/bookings`
- `GET /api/businesses/:businessId/bookings`
- `GET /api/businesses/:businessId/bookings/:bookingId`
- `PATCH /api/businesses/:businessId/bookings/:bookingId`
- `POST /api/businesses/:businessId/bookings/:bookingId/submit`
- `POST /api/businesses/:businessId/bookings/:bookingId/confirm`
- `POST /api/businesses/:businessId/bookings/:bookingId/cancel`

## Regla de coordinación Backend → Frontend

Cuando Backend modifica un contrato que consume Frontend, actualizar esta sección con:

- fecha;
- historia;
- endpoint;
- cambio;
- breaking change: sí/no;
- acción requerida en frontend.

## Cambios recientes relevantes para Frontend

- BKG-005 finalizado: Booking soporta DRAFT → PENDING → CONFIRMED y CANCELLED.
- Confirm persiste PricingSnapshot.
- Availability considera Bookings, Blocks y reglas configurables.
- API disponible dentro del stack Docker.

## Decisiones / hallazgos pendientes

La revisión Swagger Jeni/Tobera puede generar:
- bugs;
- decisiones de seguridad;
- inconsistencias de API;
- capacidades faltantes;
- mejoras de documentación.

No implementar estos hallazgos hasta clasificarlos y aprobarlos.
