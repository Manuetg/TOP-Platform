# TOP — Arquitectura técnica inicial

## 1. Objetivos de arquitectura

Permitir construir el MVP con simplicidad, consistencia de reglas de negocio, aislamiento por Negocio, trazabilidad y evolución controlada.

## 2. Principios técnicos

- Monolito modular, DDD pragmático y arquitectura hexagonal simplificada.
- Las reglas de negocio viven exclusivamente en backend.
- Frontend, WhatsApp, IA y futuras APIs consumen las mismas capacidades de aplicación.
- No usar microservicios, CQRS ni Event Sourcing en el MVP.
- Cada dato y operación se ejecuta en el contexto de un Negocio.

## 3. Arquitectura de alto nivel

Clientes → API HTTP → módulos de aplicación → dominio → adaptadores de persistencia, archivos y servicios externos.

## 4. Monolito modular

Un único despliegue contiene módulos con límites explícitos. Cada módulo expone casos de uso y contratos; no accede directamente a la persistencia interna de otro módulo.

## 5. Módulos

- `business`: Negocio, configuración, moneda y zona horaria.
- `identity-access`: usuarios, pertenencia a Negocio y roles.
- `resource`: unidades reservables y estado operativo.
- `pricing`: tarifas, reglas y Pricing Snapshot.
- `availability`: consultas y revalidación de disponibilidad.
- `contact`: contactos responsables e historial.
- `booking`: reservas, estados, estadías y número visible.
- `payment`: planes, pagos, aplicaciones y saldo derivado.
- `block`: indisponibilidades operativas.
- `audit`: historial y trazabilidad.
- `files`: adjuntos y comprobantes.

## 6. Capas por módulo

- `domain`: entidades, value objects, reglas y eventos internos.
- `application`: casos de uso, comandos, consultas, autorizaciones y transacciones.
- `infrastructure`: PostgreSQL, almacenamiento de archivos y adaptadores externos.
- `presentation`: controladores HTTP, DTOs y validación de entrada.

## 7. Dependencias permitidas entre módulos

Los módulos dependen de contratos de aplicación, no de infraestructura ajena. `booking` puede invocar `availability`, `pricing`, `contact`, `payment`, `audit` y `files`; `availability` consulta contratos de `resource`, `booking`, `block` y `business`; `payment` consulta el total acordado de `booking`/`pricing`. Se prohíben dependencias circulares.

## 8. Modelo multi-tenant

`business_id` forma parte de toda entidad operativa. Cada caso de uso valida el Negocio activo y las consultas se filtran obligatoriamente por ese contexto. No se permite cambiar el Negocio de una entidad existente.

## 9. Identidad y autorización

Identificadores internos UUID. Roles: `OWNER`, `ADMIN`, `RECEPTIONIST` y `VIEWER`. Todas las autorizaciones se validan en backend, dentro de application antes de ejecutar capacidades.

- `OWNER`: acceso total, usuarios, configuración, Pricing, anulaciones, suscripción y propiedad.
- `ADMIN`: operación, configuración, usuarios excepto propiedad, Pricing, anulaciones y Resources.
- `RECEPTIONIST`: Contacts, Availability, Bookings, check-in, check-out y registro de Payments.
- `VIEWER`: solo lectura.

El rol se resuelve desde UserBusinessMembership para el `userId + businessId` solicitado y no se incluye en el JWT. IAM-007 no incorpora endpoints de Roles, cambio posterior de rol ni un modelo persistido de Permissions.

IAM-008 reemplaza la inferencia final basada en verbos HTTP por una policy estática y tipada de capabilities. `AuthorizationPolicy` es lógica pura, independiente de NestJS, HTTP y Prisma; `BusinessAuthorizationGuard` actúa como adaptador HTTP, obtiene actor y Business, resuelve la Membership vigente e invoca la policy antes del caso de uso. Toda ruta BUSINESS declara su capability y la ausencia de capability o permiso se resuelve con default deny. El catálogo incluye las capabilities vigentes de Business, Membership, Contact, Resource, Availability, Block, Pricing y Booking, y reserva `payment.read`/`payment.record` para las historias PAY.

Los scopes de autorización son `BUSINESS`, `SELF`, `GLOBAL`, `PUBLIC` y `SYSTEM`. La matriz Role → Capability solo concede autoridad BUSINESS. Las operaciones GLOBAL `POST /api/businesses`, `POST /api/users` y `PATCH /api/users/:id/disable` quedan fail-closed hasta que exista una autoridad de plataforma aprobada. IAM-008 no agrega Permission tables, migración, endpoint, Role al JWT ni cambio posterior de Role.

IAM-005 es self-service sobre la identidad global: `PATCH /api/users/:userId` exige JWT `ACTIVE` y coincidencia entre `sub` y `userId`. Solo persiste el email permitido mediante `UserRepository`; no usa roles tenant-scoped para otorgar autoridad global, no modifica Membership ni Credential y no revoca sesiones porque la identidad `sub` permanece estable.

## 10. Persistencia

PostgreSQL es la base relacional. Relaciones many-to-many se representan explícitamente cuando el dominio lo requiere. `BookingResource` es la relación conceptual entre Booking y Resource, con Booking, Resource, fecha de entrada y fecha de salida. El flujo principal se optimiza para una unidad, pero el modelo soporta múltiples Resources.

Booking usa UUID interno y número entero secuencial único por Negocio como identificador visible, inicialmente con formato `#000001`. Los números nunca se reutilizan y se asignan dentro de la transacción de confirmación.

## 11. Modelo monetario

Importes monetarios se almacenan como enteros en la unidad mínima de moneda; no se utiliza `float`. El MVP admite una única moneda por Negocio y usa redondeo matemático estándar a la unidad mínima. Impuestos y multimoneda quedan fuera del primer MVP.

## 12. Fechas y zonas horarias

Instantes técnicos se almacenan en UTC. Cada Negocio usa una zona horaria IANA. Fechas puras de entrada y salida se almacenan como `date`; la presentación convierte horas a la zona horaria del Negocio.

Los intervalos temporales son semiabiertos: `[inicio, fin)`. Una Booking que termina en una fecha no entra en conflicto con otra que comienza en esa misma fecha.

## 13. Transacciones y concurrencia

Confirmar Booking ocurre en una única transacción atómica: valida autorización y datos, revalida Availability, protege los registros necesarios, asigna número visible, persiste Booking confirmada y Pricing Snapshot, registra auditoría y confirma la transacción.

Dos solicitudes incompatibles sobre el mismo Resource no pueden completarse. La implementación inicial usa transacción de base de datos, bloqueo pesimista o restricción equivalente, verificación final de solapamiento e idempotencia para evitar duplicados. El mecanismo concreto de Prisma/PostgreSQL se define durante implementación, sin cambiar este comportamiento.

## 14. Eventos de dominio internos

Los módulos pueden publicar eventos internos después de completar la transacción, por ejemplo `BookingConfirmed`, `PaymentRegistered` o `BlockCreated`. No se adopta Event Sourcing ni un bus distribuido en el MVP.

## 15. API

API HTTP versionada, orientada a recursos y casos de uso. Autentica usuarios, resuelve contexto de Negocio, valida DTOs y delega en application. La especificación de endpoints queda pendiente.

## 16. Archivos y comprobantes

`files` almacena metadatos y referencias a un proveedor de almacenamiento. Payment puede asociar comprobantes; no se guardan binarios en tablas de dominio. Proveedor, límites y formatos quedan pendientes.

## 17. Auditoría y observabilidad

`audit` registra entidad, identificador, usuario, instante, cambios y motivo cuando corresponda. Logs estructurados, métricas y trazas son necesarios; su plataforma concreta queda pendiente.

## 18. Seguridad

Autenticación, autorización por rol, aislamiento por Negocio, validación en backend, mínimos privilegios y protección de secretos. No se almacenan credenciales bancarias ni datos sensibles de tarjetas.

## 19. Testing

Priorizar pruebas de dominio y aplicación para reglas de negocio, integración para persistencia/transacciones y pruebas de API para contratos críticos. Casos de doble reserva, auditoría y aislamiento son obligatorios.

## 20. Despliegue inicial

Un servicio backend, PostgreSQL administrado y almacenamiento de objetos S3-compatible. Configuración por variables de entorno, migraciones versionadas y backups de base de datos.

## 21. Estructura de carpetas propuesta

```text
backend/
  src/modules/<module>/{domain,application,infrastructure,presentation}
  src/shared/{database,http,auth,observability}
  src/main.ts
```

## 22. Decisiones explícitamente fuera del MVP

- Microservicios, CQRS y Event Sourcing.
- IA, WhatsApp automatizado, Marketplace, Channel Manager y Revenue Management.
- Contabilidad, facturación electrónica, pagos online y conciliación bancaria.
- Inventario, Maintenance, Cleaning, CRM avanzado, múltiples sucursales, reservas parciales y jerarquías de Resource.

## 23. Riesgos y decisiones pendientes

- Stack aprobado: TypeScript, NestJS, PostgreSQL, Prisma, REST con OpenAPI, almacenamiento S3-compatible, Docker y GitHub Actions. Se adopta por tipado, modularidad, ecosistema, migraciones y despliegue simple. Puede registrarse posteriormente mediante ADR sin bloquear el MVP.
- La autenticación propia en NestJS para el MVP se define en [ADR-001: Estrategia de autenticación para el MVP](13-adr/ADR-001-estrategia-autenticacion-mvp.md). El proveedor concreto de almacenamiento S3-compatible, la solución inicial de observabilidad, la política y proveedor de backups, el proveedor de despliegue, y el tratamiento futuro de impuestos y multimoneda permanecen pendientes.
