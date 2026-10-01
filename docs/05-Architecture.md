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

### Perfil personal — contrato aditivo local (2026-10-01)

`GET` y `PATCH /api/users/:id/profile` incorporan una capacidad separada para lectura de identidad y actualización exclusiva de `displayName`, autorizada por el encargo de configuración y perfil. Estado **In Progress**, con contrato de nombre cerrado e implementación integrada en el snapshot local ee038ce, con gates locales registrados en Estado actual; no se declara Completed ni aprobación de PR. Ambos endpoints requieren autenticación y scope `SELF`, validan UUID, coincidencia entre actor y path y User `ACTIVE`, sin resolver membresías ni roles del Business activo.

Los casos de uso `GetUserProfileUseCase` y `UpdateUserProfileUseCase` residen en Identity. PATCH recibe `displayName`, `reason` y `expectedUpdatedAt`: valida nombre string, `trim` y longitud final de 1 a 120, motivo real ingresado por el usuario y recortado no vacío, y versión ISO UTC con milisegundos. GET conserva `null` para nombres legacy ausentes. `UserProfileResponseDto` publica solo `id`, `email`, `displayName`, `status` y `updatedAt`, con `Cache-Control: no-store`; no serializa credenciales, hashes, tokens, sesiones, membresías, auditoría ni verificación interna.

El puerto aditivo `UserProfileChangeRepository` recibe sujeto, actor, nombre, motivo y versión esperada. El adaptador Prisma abre una transacción y bloquea la fila mediante SQL parametrizado `SELECT ... FROM "User" ... FOR UPDATE`, obtiene el valor actual y comprueba `SELF`, `ACTIVE` y `updatedAt` exacto. Un conflicto de versión se traduce a HTTP `409` antes de decidir un no-op. Un cambio efectivo actualiza solo `displayName` y `updatedAt`, que avanza al menos un milisegundo respecto al valor actual; no vuelve a persistir email, estado ni `emailVerifiedAt` de un snapshot previo, ni modifica Credential, Membership o RefreshSession.

La misma transacción crea `UserDisplayNameAudit` con User sujeto, actor autenticado, fecha/hora, nombre anterior real nullable, nombre nuevo y motivo, conforme a BR-056/BR-063. Si falla la auditoría se revierte también nombre y versión. La migración aditiva crea esta tabla, su índice por sujeto/fecha/id y FK `RESTRICT` a sujeto y actor; no hace backfill de nombres ni de auditorías históricas. Nombre normalizado idéntico con versión vigente devuelve el perfil sin escritura, auditoría ni avance de versión; los tokens se conservan. Repetir un cambio confirmado con la versión anterior devuelve `409`. La concurrencia y el rollback se verifican sobre el commit integrado mediante los gates correspondientes; resultados y límites en Estado actual.

El consumidor frontend usa la API compartida, consulta el perfil por identidad y envía nombre, motivo ingresado por el usuario y la versión consultada. Ante `409`, debe consultar datos actuales antes de permitir un nuevo intento con la versión vigente; el correo se presenta para lectura. IAM-005 y su comportamiento de sesiones se preservan. El modelo actual `EmailVerificationToken` referencia User y carece de un email de destino congelado; `VerifyEmailUseCase` marca verificado por `userId`, mientras `updateEmail` conserva `emailVerifiedAt`. La habilitación de cambio seguro de correo, su revalidación y política de tokens/sesiones permanecen pendientes y no se incorporan en esta capacidad.

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

### POST-B — primer corte de arranque seguro (2026-09-30)

Configuración central en `backend/src/config/environment.ts`, integrada con ConfigModule antes de crear el servidor HTTP. Se aceptan development/test/production; sin NODE_ENV de runtime se usa development y solo allí se carga `.env`. ConfigModule ignora archivos env en test/producción. El bootstrap HTTP por defecto (`main.ts`) captura/valida runtime antes de importar Prisma; en producción inspecciona los metadatos del cliente generado sin importarlo y rechaza rutas de autoload env o formato desconocido. Esa protección corresponde al bootstrap HTTP, no a CLI ni imports directos de AppModule. La imagen genera ese cliente en contexto limpio; no se parchea SDK ni schema. Los errores indican variable/requisito sin valores; el proceso termina con error antes de listen. ConfigService conserva el snapshot validado (`skipProcessEnv`) y los clientes Prisma reciben explícitamente DATABASE_URL, preservando sus parámetros. La comprobación del artefacto debe revisarse al actualizar Prisma.

Los cuatro TTL de autenticación conservan sus defaults y exigen conversión exacta a milisegundos y expiración dentro del rango Date y DateTime de Prisma vigente (año hasta 9999) al sumar el instante de validación. El máximo técnico se calcula una vez por validación con el reloj actual; no introduce un techo comercial ni cambia algoritmos/contratos. Fórmula y alcance temporal de la comprobación en README backend.

Producción exige JWT y OTP independientes de al menos 32 bytes, URL pública y CORS HTTPS explícitos, SMTP y almacenamiento S3 completo. SMTP usa TLS directo en puerto 465 y STARTTLS obligatorio en los demás, con certificados validados; se construye únicamente el adaptador seleccionado. No hay pruebas remotas obligatorias de SMTP/storage al arrancar. S3 conserva SDK, upload/delete/paths, URLs firmadas y fallback opcional del endpoint público; memoria solo en desarrollo/test sin bucket. Defaults y matriz completa en [README backend](../backend/README.md).

CORS compara orígenes completos, sin comodines ni fallback abierto. Orígenes ajenos no reciben permiso ni producen 500; preflight conserva autenticación e idempotencia. Guards y aislamiento por Business siguen siendo la autoridad, también sin Origin. Swagger UI/JSON/YAML no se generan ni registran en producción. La auditoría de controladores registrados no encontró rutas HTTP exclusivas debug/test/seed; seed y aprovisionamiento siguen siendo CLI controladas.

Imagen con NODE_ENV=production después de instalación/build; Compose declara development y conserva volúmenes. Ignore Git/Docker excluye env y credenciales; `.env` local se preserva fuera del índice. Este corte cubre B3/B4/B6 y configuración/empaquetado de B2: no modifica dominio, contratos, esquema ni proveedor cloud y no acredita todo B ni Production Ready.

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

## POST-MVP A — contratos y consumidores (2026-09-24)

ArchiveContactUseCase valida Business activo e identificadores; `ContactRepository.archive` realiza la transición tenant-scoped e idempotente y su auditoría en una transacción PostgreSQL. La migración aditiva `20260924000000_contact_archive_audit` incorpora `Contact.archivedAt`, `archivedBy` y `archivedFromStatus`, sin backfill ni cambios en FK/Bookings. Un update ordinario ya no escribe status; evita restauraciones por una edición concurrente. Auditoría interna no se añade al DTO público.

`PATCH /api/businesses/:businessId/contacts/:contactId/archive`: sin body; `contact.write`, JWT/membresía vigente, actor desde principal. Respuesta 200 ContactResponseDto (también al repetir), 400 identificadores inválidos, 401/403 autenticación/autorización, 404 Business/Contact ausente o Contact cruzado y 409 Business no activo. No expone Restore. Contact Detail permanece abierto con éxito, invalida detalle/listado/búsqueda y aborta al desmontarse/cambiar contexto. Abortar el cliente no implica rollback backend.

POST/PATCH Contact mantienen campos públicos. `libphonenumber-js/min` con versión fija en ambos lockfiles proporciona metadatos de país/prefijos y longitud posible, evitando un catálogo mundial manual y sin añadir un paquete UI. Es una dependencia acotada justificada por A3 ([documentación primaria](https://github.com/catamphetamine/libphonenumber-js)); carga con las rutas consumidoras. País usa labels españoles/ISO y aliases del catálogo existente. Nuevos valores con contexto se normalizan a E.164; el contrato legado sin país y valores históricos no editados se preservan según Business Rules. WhatsApp solo genera enlace para un número internacional inequívoco.

ConfirmBooking conserva los requests basados en Rate Plan y la variante explícita `pricingMode: MANUAL_NO_RATE_PLAN`, con `resourceId`, `agreedAmountMinor` y `overrideReason` obligatorios y `ratePlanId` omitido por completo. El guard exige `pricing.override.calculate` (OWNER/ADMIN) ante modo, monto o motivo, aun si están vacíos o nulos. La ausencia implícita de plan no habilita el modo manual; un modo manual junto con `ratePlanId` se rechaza. No cambia el endpoint de override sobre plan.

`PrepareManualPriceUseCase` comparte validación monetaria/motivo y utiliza las validaciones necesarias de Business, Resource y fechas sin depender de `ListRatePlansUseCase` ni consultar el catálogo para decidir elegibilidad. Revalida identificadores, estados activos, pertenencia al tenant y estadía de 1..365 noches; obtiene la moneda del Business. Un tarifario nuevo o aplicable no provoca el antiguo 409 de elegibilidad manual. Se mantienen locks de Booking/Resource, autorización, validación de disponibilidad y transacción atómica de Snapshot, estado y Timeline. Las demás condiciones de confirmación siguen siendo autoritativas en backend.

`PricingSnapshotItem` es una unión discriminada compatible con históricos: CALCULATED/MANUAL_OVERRIDE conservan su forma; MANUAL_NO_RATE_PLAN tiene `ratePlanId`, `suggestedAmountMinor` y `adjustmentAmountMinor` nulos, `breakdown: []`, noches reales, monto acordado y motivo normalizado. El identificador expresa falta de referencia en el precio registrado, sin afirmar que no haya planes disponibles. Actor en BOOKING_CONFIRMED y fecha en Snapshot/Timeline según los contratos existentes. `items` ya es JSON: no requiere migración SQL ni reescritura histórica. PaymentPlan, Payments y saldos usan moneda/total; Revenue sigue sumando pagos registrados, sin convertir el precio manual en descuento.

Calendar y Confirm Booking ofrecen Configurada y Manual a OWNER/ADMIN con contexto válido. Configurada conserva selección de plan, cálculo y descuentos; sus estados de carga, error y refetch corresponden al catálogo. Manual permite importe y motivo sin selector, selección oculta ni cálculo previo, incluso con cero, uno o varios planes; carga, error o refetch del catálogo no desmontan ni bloquean su edición. El prefijo fijo dentro del input usa la moneda del Business, queda fuera del valor editable y del payload, y para PYG `₲ 450.000` produce `agreedAmountMinor: 450000`. Cambiar identidad, Business, Booking, Resource o fechas invalida el borrador anterior y descarta respuestas tardías; cambiar de modo no mezcla precios ni previews. Si Calendar ya envió la reserva a PENDING y falla la confirmación, abre la confirmación de esa misma reserva con el error; no crea otra al reintentar.

Presentación frontend: helper puro `formatPureDate` (dd/mm/yyyy) separado de `formatBusinessInstant` (timezone IANA explícita). ISO permanece en API, inputs nativos y atributos dateTime. Calendar conserva encabezados de mes/día como navegación parcial. ConfirmDialog reutiliza OverlayPanel y Foundation; carga bloquea cierre/duplicados, error queda en el diálogo y el cierre devuelve foco sin desplazar una navegación del shell.

## 25. Quality gate frontend del MVP (histórico)

Las páginas operativas y Login usan `React.lazy`/`Suspense` por ruta; el shell y los guards permanecen disponibles y la espera expone un status accesible. Se conserva el respaldo por página y general; errores de importación no exponen detalles internos. No se elevó el umbral de 500 kB.

Calendar consume Business Context; se elimina su única dependencia productiva de `VITE_DEV_BUSINESS_ID`. Sus lecturas reciben AbortSignal desde QueryClient y sus operaciones encadenadas cancelan al cerrar/desmontar. Una respuesta de alta tardía no inicia Submit/Confirm, no navega ni actualiza otra UI. El backend puede haber confirmado una operación antes del aborto: la cancelación cliente no equivale a rollback y no borra reservas. El diálogo reutiliza OverlayPanel, foco, Escape y Tab; la identidad estable no depende del token rotado.

El helper monetario compartido de presentación/entrada mantiene PYG entero. No implementa reglas financieras ni conversión FX; Pricing y Payments continúan consumiendo importes calculados por backend. Los contratos HTTP y datos persistidos permanecen intactos.

Calendar mantiene fechas puras YYYY-MM-DD en Availability y Booking. El helper business-date usa Intl/IANA para fecha del instante y límites de día comercial (incluye DST y medianoche ausente/repetida). Blocks recibe límites UTC RFC3339 derivados de activeBusiness.timezone y se intersecta con intervalos locales [inicio, fin). El soporte UTC para aritmética gregoriana y etiquetas no define los instantes comerciales. Cambiar Business/identidad/timezone remonta el estado del calendario, cancela lecturas/operaciones y recalcula límites; no se cambia el contrato backend.
