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
- `booking`: reservas, estados y estadías; la numeración visible aprobada continúa pendiente de implementación.
- `payment`: planes, pagos, aplicaciones y saldo derivado.
- `block`: indisponibilidades operativas.
- `dashboard`: composición read-only de KPI derivados, sin persistencia propia.
- `search`: composición read-only de resultados limitados por Business; extensión expresamente aprobada bajo FE-FND-009, sin tablas ni repositorio propio.
- `audit`: historial y trazabilidad.
- `files`: adjuntos y comprobantes.

## 6. Capas por módulo

- `domain`: entidades, value objects, reglas y eventos internos.
- `application`: casos de uso, comandos, consultas, autorizaciones y transacciones.
- `infrastructure`: PostgreSQL, almacenamiento de archivos y adaptadores externos.
- `presentation`: controladores HTTP, DTOs y validación de entrada.

## 7. Dependencias permitidas entre módulos

Los módulos dependen de contratos públicos de Application, no de infraestructura ajena. `booking` consume contratos de `availability`, `pricing` y `contact`; `availability` consulta contratos de `resource`, `booking`, `block` y `business`; `payment` consume contratos públicos de `booking` y `pricing` para resolver la Booking y su PricingSnapshot. Booking no depende de Payment en el MVP vigente. Una relación entre datos no autoriza imports bidireccionales y se prohíben dependencias circulares.

PAY-004 reside en `payment` como Query Use Case read-only. Resuelve Business, Booking y PricingSnapshot mediante contratos públicos y obtiene su proyección financiera desde un repositorio de lectura propio. La infraestructura agrega Payments, installments y PaymentApplications mediante una única sentencia PostgreSQL con agregados independientes, evitando multiplicación de filas y observando un único snapshot MVCC sin bloqueo pesimista. No persiste balances ni estados derivados.

Pricing expone `GET /api/businesses/:businessId/rate-plans` mediante `ListRatePlansUseCase` y `RatePlanRepository`. El modo general devuelve el catálogo tenant-scoped; el modo contextual recibe conjuntamente Resource y estadía y aplica las reglas de seleccionabilidad antes de mapear al `RatePlanResponseDto` público. No accede a Booking ni expone PricingSnapshot, y no requiere cambios de schema.

Dashboard consume contratos públicos de Application de los dominios propietarios. DSH-002 obtiene su proyección desde Availability, que agrega Resource, BookingResource, Booking y Block en PostgreSQL sin exponer su infraestructura a Dashboard. DSH-003 obtiene desde Payment un agregado tenant-scoped de Payments `RECORDED` por `paidAt`; la infraestructura agrupa por moneda mediante una única consulta PostgreSQL parametrizada, sin cargar Payments ni unir Booking, PricingSnapshot, PaymentPlan o PaymentApplications. DSH-004 obtiene desde Booking un agregado tenant-scoped por `createdAt` y estado actual mediante una única consulta PostgreSQL, sin cargar Bookings ni unir Resources, Contact o Timeline. Estas capacidades no tienen endpoint propio; DSH-001 las ejecuta concurrentemente desde Application y expone su composición all-or-nothing bajo `GET /api/businesses/:businessId/dashboard`, sin infraestructura de Dashboard. Los dominios fuente no dependen de Dashboard y no se persisten ni cachean los agregados.

FE-FND-009 incorpora `GET /api/businesses/:businessId/search?q=...` como extensión aprobada del baseline backend 53/53. Search consume lectores públicos de Application de Resource, Contact y Booking; cada módulo propietario filtra y limita en PostgreSQL. No importa infraestructura ajena, no modifica los contratos HTTP existentes, no hay dependencias inversas ni N+1. Identity expone la resolución de capabilities basada en membresía vigente y la AuthorizationPolicy existente. `search.read` permite entrada a los cuatro roles, pero cada lector requiere su capability de lectura; los grupos denegados no se ejecutan ni se serializan. Se exige Business ACTIVE, se ejecutan consultas autorizadas concurrentemente y se falla todo el bloque ante un error técnico. Respuesta mínima no-store; sin índices, migraciones, caché persistente ni servicios externos.

## 8. Modelo multi-tenant

`business_id` forma parte de toda entidad operativa. Cada caso de uso valida el Negocio activo y las consultas se filtran obligatoriamente por ese contexto. No se permite cambiar el Negocio de una entidad existente.

## 9. Identidad y autorización

Identificadores internos UUID. Roles tenant-scoped: `OWNER`, `ADMIN`, `RECEPTIONIST` y `VIEWER`. Todas las autorizaciones se validan en backend antes de ejecutar capacidades y la matriz Role → Capability de IAM-008 es la autoridad.

- `OWNER`: accede a las capabilities BUSINESS vigentes de su Negocio.
- `ADMIN`: opera y configura dentro de las capabilities vigentes; no archiva Business ni asigna OWNER.
- `RECEPTIONIST`: opera las capabilities aprobadas de Contact, Availability, Block, Booking y Payment; no configura Resource, Pricing ni Availability Rules.
- `VIEWER`: accede únicamente a capabilities de lectura.

Los roles tenant-scoped no conceden autoridad GLOBAL. Payment void/refund, Ownership/Subscription y sus autorizaciones permanecen fuera del alcance implementado.

El rol se resuelve desde UserBusinessMembership para el `userId + businessId` solicitado y no se incluye en el JWT. IAM-007 no incorpora endpoints de Roles, cambio posterior de rol ni un modelo persistido de Permissions.

IAM-008 reemplaza la inferencia final basada en verbos HTTP por una policy estática y tipada de capabilities. `AuthorizationPolicy` es lógica pura, independiente de NestJS, HTTP y Prisma; `BusinessAuthorizationGuard` actúa como adaptador HTTP, obtiene actor y Business, resuelve la Membership vigente e invoca la policy antes del caso de uso. Toda ruta BUSINESS declara su capability y la ausencia de capability o permiso se resuelve con default deny. El catálogo incluye las capabilities vigentes de Business, Membership, Contact, Resource, Availability, Block, Pricing, Booking, Payment y Dashboard; `dashboard.read` usa scope BUSINESS y permite lectura a los cuatro roles tenant-scoped.

Los scopes de autorización son `BUSINESS`, `SELF`, `GLOBAL`, `PUBLIC` y `SYSTEM`. La matriz Role → Capability solo concede autoridad BUSINESS. Las operaciones GLOBAL `POST /api/businesses`, `POST /api/users` y `PATCH /api/users/:id/disable` quedan fail-closed hasta que exista una autoridad de plataforma aprobada. IAM-008 no agrega Permission tables, migración, endpoint, Role al JWT ni cambio posterior de Role.

IAM-005 es self-service sobre la identidad global: `PATCH /api/users/:userId` exige JWT `ACTIVE` y coincidencia entre `sub` y `userId`. Solo persiste el email permitido mediante `UserRepository`; no usa roles tenant-scoped para otorgar autoridad global, no modifica Membership ni Credential y no revoca sesiones porque la identidad `sub` permanece estable.

## 10. Persistencia

PostgreSQL es la base relacional. Relaciones many-to-many se representan explícitamente cuando el dominio lo requiere. `BookingResource` relaciona Booking y Resource; las fechas de estadía pertenecen a Booking. El flujo principal se optimiza para una unidad, pero el modelo soporta múltiples Resources.

Booking usa UUID interno. El número entero secuencial único por Negocio sigue aprobado como identificador visible futuro, pero no forma parte del schema implementado actual.

## 11. Modelo monetario

Importes monetarios se almacenan como enteros en la unidad mínima de moneda; no se utiliza `float`. El MVP admite una única moneda por Negocio y usa redondeo matemático estándar a la unidad mínima. Impuestos y multimoneda quedan fuera del primer MVP.

## 12. Fechas y zonas horarias

Instantes técnicos se almacenan en UTC. Cada Negocio usa una zona horaria IANA. Fechas puras de entrada y salida se almacenan como `date`; la presentación convierte horas a la zona horaria del Negocio.

Los intervalos temporales son semiabiertos: `[inicio, fin)`. Una Booking que termina en una fecha no entra en conflicto con otra que comienza en esa misma fecha.

## 13. Transacciones y concurrencia

Confirmar Booking ocurre en una única transacción atómica: valida autorización y datos, revalida Availability, protege los registros necesarios, persiste Booking confirmada y Pricing Snapshot, registra su Timeline y confirma la transacción.

Dos solicitudes incompatibles sobre el mismo Resource no pueden completarse. La implementación inicial usa transacción de base de datos, bloqueo pesimista o restricción equivalente, verificación final de solapamiento e idempotencia para evitar duplicados. El mecanismo concreto de Prisma/PostgreSQL se define durante implementación, sin cambiar este comportamiento.

## 14. Eventos de dominio internos

Los módulos pueden publicar eventos internos después de completar la transacción, por ejemplo `BookingConfirmed`, `PaymentRegistered` o `BlockCreated`. No se adopta Event Sourcing ni un bus distribuido en el MVP.

## 15. API

API HTTP versionada, orientada a recursos y casos de uso. Autentica usuarios, resuelve contexto de Negocio, valida DTOs y delega en application. Los endpoints implementados se documentan en el Backlog y OpenAPI; los contratos de capacidades planificadas permanecen pendientes hasta su discovery.

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

## 24. Subscription & Entitlements del MVP

El módulo Subscription persiste `SubscriptionPlan` y `BusinessSubscription`. `SubscriptionCoreModule` publica el puerto `RESOURCE_QUOTA`; Resource lo utiliza para serializar altas mediante `pg_advisory_xact_lock` por Business y transacción Prisma. Resource conserva la responsabilidad del conteo y escritura de su inventario dentro de esa transacción; Subscription conserva la asignación y el cupo. El scope de transacción es opaco para application. La composición de lectura usa `RESOURCE_USAGE_READER`, evitando acceso privado entre módulos y ciclos de módulos Nest.

Contratos nuevos, ambos con `Cache-Control: no-store`, UUID validado, autenticación y Membership vigente:

- `GET /api/businesses/:businessId/subscription`: `subscription {planCode, planName}`, `entitlements {maxResources}`, `usage.resources {used, available, percentage, state, canCreate}` y `upgrade {status, requestedAt}`. Todos los roles leen. Business no activo produce 409; inexistente 404. Error de una proyección no devuelve datos parciales.
- `POST /api/businesses/:businessId/subscription/upgrade-request`: sin payload comercial; OWNER registra su actor desde el principal. Responde 200 `{status: REQUESTED, requestedAt}` tanto al crear como al repetir. No envía comunicaciones externas ni cambia el plan.
- Consumidor afectado: `POST /api/businesses/:businessId/resources` agrega el conflicto `409 {code: RESOURCE_LIMIT_REACHED, message}`; su payload y respuesta exitosa permanecen compatibles.

La UI usa `apiRequest` y QueryClient con clave `subscription/userId/businessId`, separada del token renovable. Perfil y alta de Resource comparten la lectura. Cambio de identidad/Business cancela lecturas y aborta mutaciones pendientes; resultados tardíos no confirman otra pantalla. La creación de Resource invalida cupo/listado; un GET posterior fallido no repite el POST. Un plan desconocido o no actualizado bloquea el alta en UI hasta reintentar. Backend siempre revalida el límite concurrente.

Operación MVP: el registro persistido es el destino real de «Solicitar ampliación». El operador autorizado puede consultar pendientes con `SELECT "businessId", "upgradeRequestedAt", "upgradeRequestedBy" FROM "BusinessSubscription" WHERE "upgradeRequestedAt" IS NOT NULL ORDER BY "upgradeRequestedAt";` dentro del entorno administrativo protegido. No se exporta esta información al cliente ni se inventa un contacto comercial. La resolución comercial y un eventual cambio de plan requieren decisión y procedimiento administrativo auditado; no son un cobro o upgrade automático de este MVP.
