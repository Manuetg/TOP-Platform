# Domain Bible
## Business

### 1. Propósito

Representar el Negocio dentro de TOP como parte del Core y del alcance del MVP, preservando el aislamiento de datos por Negocio.

### 2. Responsabilidad

El dominio Business es responsable de delimitar el Negocio al que pertenecen los datos administrados por TOP.

La configuración específica del Negocio está **Pendiente de definición**.

### 3. No Responsabilidad

El dominio Business no es responsable de las áreas que TOP define como Extensions: IA, WhatsApp, Marketplace, Inventario, Limpieza, CRM, Contabilidad, Facturación electrónica, Channel Manager y Revenue Management.

Tampoco convierte a TOP en un ERP, software contable, marketplace, channel manager ni sistema de revenue management.

Las responsabilidades específicas que correspondan a los demás dominios están **Pendientes de definición**.

### 4. Conceptos principales

- **Negocio:** límite de aislamiento de datos de TOP.
- **Moneda:** configuración monetaria del Negocio.
- **Zona Horaria:** configuración horaria del Negocio.
- **Configuración:** conjunto de valores configurables del Negocio.
- **Estado:** condición operativa del Negocio.

### 5. Información administrada

El dominio Business administra la delimitación del Negocio necesaria para mantener el aislamiento de datos por Negocio, junto con la siguiente información:

| Grupo | Información |
| --- | --- |
| Identidad | Id, Nombre Comercial, Nombre Legal (opcional), Estado |
| Ubicación | País, Departamento/Estado, Ciudad, Dirección |
| Configuración | Moneda, Zona Horaria, Idioma |
| Contacto | Email, Teléfono, WhatsApp |
| Auditoría | Fecha de creación, Fecha de modificación |

### 6. Reglas de negocio

- Los datos deben mantenerse aislados por Negocio.
- No se debe eliminar información histórica o financiera.
- Las modificaciones relevantes deben ser auditables.
- No se deben inventar funcionalidades ni reglas.

Las reglas operativas específicas del Negocio están **Pendientes de definición**.

### 7. Estados

Los estados del Negocio son:

- Activo.
- Suspendido.
- Archivado.

Las transiciones permitidas entre estados están **Pendientes de definición**.

### 8. Eventos

Los eventos de dominio asociados al Negocio son:

- `BusinessCreated`.
- `BusinessUpdated`.
- `BusinessSuspended`.
- `BusinessArchived`.

### 9. Relaciones

El Negocio actúa como límite de aislamiento para los datos administrados por TOP.

El dominio Business se relaciona con:

- Resource.
- Contact.
- Booking.
- Pricing.
- Payment.
- Block.
- Identity & Access.

La naturaleza y cardinalidad de cada relación están **Pendientes de definición**.

### 10. Capacidades

- Negocio es una capacidad Core del producto.
- Negocio forma parte del alcance del MVP.
- Crear negocio.
- Actualizar negocio.
- Suspender negocio.
- Reactivar negocio.
- Consultar configuración.

Las reglas de autorización y el detalle operativo de cada capacidad están **Pendientes de definición**.

### 11. Restricciones

- Mantener el aislamiento de datos por Negocio.
- No eliminar físicamente el Negocio.
- No compartir datos entre Negocios.
- Conservar historial financiero y operativo.
- Mantener auditables las modificaciones relevantes.
- No ampliar el alcance del MVP sin autorización explícita.
- Priorizar simplicidad, enfoque mobile first y velocidad operativa.

### 12. Pendientes

- Facturación electrónica (futuro).
- Multi-sucursal (futuro).
- Transiciones permitidas entre estados.
- Naturaleza y cardinalidad de las relaciones con otros dominios.
- Reglas de autorización y detalle operativo de las capacidades.

## Identity & Access

### 1. Propósito

Administrar la identidad global de los usuarios, sus credenciales locales y sus membresías con Negocios para habilitar autenticación y autorización en TOP.

### 2. Responsabilidad

- Mantener usuarios globales y su estado de acceso.
- Mantener credenciales locales mediante hashes de contraseña.
- Mantener la pertenencia de un usuario a uno o varios Negocios y el rol aplicable en cada membresía.
- Proveer la información necesaria para autenticar usuarios y resolver su contexto autorizado.
- Crear User y LocalCredential mediante aprovisionamiento administrativo, sin crear membresías implícitas.
- Gestionar UserBusinessMembership como capacidad separada.

### 3. No Responsabilidad

Identity & Access no:

- administra datos operativos de un Negocio;
- selecciona silenciosamente un Negocio activo durante el login;
- almacena contraseñas en texto plano;
- implementa registro público en el MVP;
- inicia sesión ni emite tokens al crear un User;
- crea credenciales como parte de la gestión de membresías;
- crea membresías como parte de la creación de User;

### 4. Conceptos principales

- **User:** identidad global de una persona que puede acceder a TOP.
- **LocalCredential:** credencial local asociada a un User para autenticación propia.
- **UserBusinessMembership:** pertenencia de un User a un Business con un rol.
- **RefreshSession:** sesión renovable asociada a un User, representada mediante un token opaco cuyo hash se persiste para rotación y revocación.
- **Rol:** nivel inicial de autorización de una membresía: `OWNER`, `ADMIN`, `RECEPTIONIST` o `VIEWER`.
- **Contexto de Negocio:** Business dentro del cual se autoriza una operación.

### 5. Información administrada

#### User

- Id UUID.
- Email normalizado y único globalmente.
- Estado: `ACTIVE` o `DISABLED`.
- Fecha de creación.
- Fecha de modificación.

#### LocalCredential

- User asociado de forma única.
- Hash de contraseña.
- Fecha de creación.
- Fecha de modificación.

La contraseña no se almacena en texto plano.

La contraseña aceptada tiene entre 12 y 128 caracteres, permite espacios y caracteres Unicode, no se trunca y se transforma en un hash Argon2id. No se aplican requisitos arbitrarios de mayúsculas, números o símbolos en el MVP. La verificación contra contraseñas comprometidas queda como mejora futura.

#### UserBusinessMembership

- Id UUID.
- User asociado.
- Business asociado.
- Rol.
- Fecha de creación.
- Fecha de modificación.

No se agrega un estado de membresía al modelo mínimo: el estado `DISABLED` del User impide su acceso. La desactivación individual de una membresía queda pendiente de definición.

#### RefreshSession

- User asociado.
- Hash SHA-256 del refresh token opaco.
- Vencimiento, rotación y revocación.

El token sin hash solo se entrega al cliente y no se persiste ni registra en logs.

### 6. Reglas de negocio

- User es una identidad global y puede pertenecer a varios Businesses.
- Un email normalizado corresponde a un único User.
- Una LocalCredential pertenece a un único User y solo almacena su hash de contraseña.
- Una combinación de User y Business solo puede tener una membresía.
- Toda membresía debe referenciar un Business existente.
- Las membresías determinan el rol del User dentro de cada Business.
- Todo User creado administrativamente se crea con estado `ACTIVE` y su LocalCredential en una única operación atómica.
- Crear User no crea una membresía ni asigna un Business implícitamente.
- IAM-009 crea UserBusinessMembership, valida la existencia de User y Business, y exige uno de los roles aprobados.
- Un email se normaliza mediante `trim` y conversión completa a minúsculas antes de validar formato y unicidad. No se eliminan puntos ni alias con `+` específicos de proveedores.
- Un email normalizado duplicado se rechaza.
- Toda operación operativa debe ejecutarse dentro de un `businessId` autorizado para el User.
- Login devuelve las membresías disponibles y no selecciona automáticamente un Business activo.
- La autorización se valida siempre en backend.
- El catálogo de roles del MVP es cerrado: `OWNER`, `ADMIN`, `RECEPTIONIST` y `VIEWER`; el rol pertenece a la membresía y nunca al User global.
- `VIEWER` solo puede ejecutar operaciones de lectura dentro de los Businesses en los que posee membresía. IAM-008 define la matriz estática Role → Capability vigente para las demás acciones.
- Los access tokens representan únicamente la identidad del User; la autorización resuelve la membresía y su rol vigente en backend.

### 7. Estados

User puede estar en uno de los siguientes estados:

- `ACTIVE`.
- `DISABLED`.

Las transiciones y la gestión individual de membresías están **Pendientes de definición**.

### 8. Eventos

Los eventos de dominio y de auditoría específicos de Identity & Access están **Pendientes de definición**. La implementación deberá conservar auditoría de los cambios relevantes de User y UserBusinessMembership.

### 9. Relaciones

- User se relaciona con una LocalCredential para la autenticación propia del MVP.
- User se relaciona con uno o varios Businesses mediante UserBusinessMembership.
- UserBusinessMembership pertenece a un User y a un Business.
- RefreshSession pertenece a un User y permite rotación y revocación de sesiones sin incorporar autorización al token.
- Un Business puede tener varios Users mediante UserBusinessMembership.
- Los módulos operativos consumen el contexto autorizado de Business, sin acceder a credenciales.

User y LocalCredential mantienen una relación uno a uno. Un User puede tener varias RefreshSessions.

### 10. Capacidades

- Crear User.
- Gestionar UserBusinessMembership.
- Iniciar sesión.
- Renovar y cerrar sesión.
- Actualizar User.
- Deshabilitar User.
- Gestionar roles y permisos según el backlog.

- **IAM-004 — Create User:** aprovisionamiento administrativo de User y LocalCredential; no crea membresía, no inicia sesión y no devuelve tokens.
- **IAM-009 — Manage User-Business Membership:** crea una membresía entre User, Business y Role; no crea User, credenciales, Login ni permisos adicionales.
- **IAM-007 — Roles:** consolida el catálogo cerrado y tenant-scoped, la asignación inicial mediante IAM-009, la exposición del rol por membresía en Login y la autorización backend; no agrega cambio posterior de rol, endpoint propio ni Permissions configurables.
- **IAM-005 — Update User:** permite que un User `ACTIVE` autenticado actualice exclusivamente su propio email mediante identidad `sub`; conserva credencial, estado, membresías, roles y sesiones. No permite administración de terceros, cambio de contraseña ni transición de estado.
- **IAM-008 — Permissions:** define un catálogo cerrado de capabilities BUSINESS y una matriz estática Role → Capability aplicada por backend. La autorización usa la Membership vigente del Business solicitado, deniega por defecto y no incorpora permisos al JWT, persistencia de Permissions, cambio de Role ni endpoint propio. Los Roles tenant-scoped nunca conceden autoridad GLOBAL.

### 11. Restricciones

- No compartir datos operativos entre Businesses.
- No permitir registro público en el MVP.
- No exponer contraseña, passwordHash, tokens ni membresías inexistentes al crear un User.
- No almacenar contraseñas, hashes o tokens en logs.
- No seleccionar un contexto de Business sin una acción o autorización explícita posterior.
- No persistir refresh tokens en claro ni incorporar roles o permisos a los tokens.

### 12. Pendientes

- Transiciones de estado de User.
- Gestión individual del estado de una membresía.
- Selección explícita del contexto activo de Business.

## Resource

### 1. Propósito

Representar una unidad reservable administrada por un Negocio.

### 2. Responsabilidad

- Mantener la identidad y características de la unidad.
- Definir su capacidad.
- Indicar si está activa para la operación.
- Participar en consultas de disponibilidad.
- Relacionarse con Pricing, Booking y Block.

### 3. No Responsabilidad

Resource no:

- Calcula disponibilidad.
- Calcula precios.
- Crea reservas.
- Administra pagos.
- Almacena clientes.
- Administra servicios o extras.

### 4. Conceptos principales

- Recurso.
- Tipo de recurso.
- Capacidad.
- Características.
- Estado.
- Código visible.
- Orden de visualización.

### 5. Información administrada

| Grupo | Información |
| --- | --- |
| Identidad | Id interno, Código visible, Nombre, Tipo, Descripción |
| Capacidad | Capacidad mínima (opcional), Capacidad máxima, Capacidad máxima de menores (opcional) |
| Características | Lista flexible de características o amenidades |
| Multimedia | Imágenes del recurso |
| Organización | Orden manual de visualización |
| Auditoría | Fecha de creación, Fecha de modificación, Usuario creador, Usuario modificador |

### 6. Reglas de negocio

- Todo Resource pertenece exactamente a un Negocio.
- Un Resource es indivisible en el MVP.
- No se permiten jerarquías padre-hijo en el MVP.
- Un Resource puede estar relacionado con múltiples reservas históricas.
- Un Resource con historial no se elimina físicamente.
- Disponible u ocupado no son estados propios del Resource.
- La interfaz debe utilizar el término correspondiente al tipo de negocio: cabaña, habitación, domo, parcela u otro.
- Internamente el concepto unificado es Resource.

### 7. Estados

- Activo.
- Fuera de servicio.
- Archivado.

Mantenimiento no es un estado permanente. Los períodos temporales de mantenimiento deben representarse mediante Block.

### 8. Eventos

- `ResourceCreated`.
- `ResourceUpdated`.
- `ResourceActivated`.
- `ResourceTakenOutOfService`.
- `ResourceReactivated`.
- `ResourceArchived`.

### 9. Relaciones

- Pertenece a Business.
- Puede asociarse a uno o varios planes o listas de Pricing.
- Puede participar en múltiples Booking.
- Puede tener múltiples Block.
- Es consultado por Availability.

No se definen aún las cardinalidades técnicas de base de datos.

### 10. Capacidades

- Crear recurso.
- Actualizar recurso.
- Activar recurso.
- Marcar fuera de servicio.
- Reactivar recurso.
- Archivar recurso.
- Consultar recurso.
- Ordenar recursos manualmente.

### 11. Restricciones

- No reservar recursos inactivos, fuera de servicio o archivados.
- No eliminar físicamente recursos con historial.
- No compartir recursos entre negocios.
- No soportar reserva parcial de un recurso en el MVP.
- No incorporar servicios, extras, inventario ni mantenimiento como parte interna del Resource.

### 12. Pendientes

- Catálogo inicial de tipos de recurso.
- Catálogo inicial de amenidades.
- Límites y formatos de imágenes.
- Validaciones específicas de capacidad.

## Pricing

### 1. Propósito

Administrar estructuras de precios flexibles y reutilizables para el Negocio, calcular opciones económicas aplicables a una reserva y conservar el precio acordado históricamente.

### 2. Responsabilidad

Pricing es responsable de:

- Administrar listas o planes de precios reutilizables.
- Permitir asignar precios a uno o varios Resources.
- Administrar vigencias y condiciones de aplicación.
- Calcular precios sugeridos según fechas, Resource, cantidad de huéspedes y duración.
- Permitir seleccionar manualmente una opción tarifaria durante la creación de una reserva.
- Permitir precios personalizados con motivo obligatorio.
- Generar un snapshot inmutable del precio acordado al confirmar una reserva.
- Mostrar un desglose comprensible del precio calculado.

### 3. No Responsabilidad

Pricing no:

- Crea ni confirma reservas.
- Determina disponibilidad.
- Registra pagos.
- Administra planes de pago.
- Modifica automáticamente reservas confirmadas cuando cambia una tarifa.
- Realiza revenue management automático.
- Predice demanda mediante IA.
- Consulta precios de competidores en el MVP.

### 4. Conceptos principales

- Lista de precios.
- Plan tarifario.
- Precio base.
- Regla de precio.
- Vigencia.
- Asignación a Resource.
- Precio sugerido.
- Precio personalizado.
- Descuento.
- Ajuste.
- Pricing Snapshot.
- Desglose por noche.
- Moneda.
- Prioridad.

### 5. Información administrada

#### Lista o plan de precios

- Id.
- Negocio.
- Nombre.
- Descripción opcional.
- Estado.
- Moneda.
- Vigencia inicial opcional.
- Vigencia final opcional.
- Prioridad.
- Resources asociados.
- Fecha de creación.
- Fecha de modificación.
- Usuario creador.
- Usuario modificador.

#### Regla de precio

- Id.
- Tipo de regla.
- Condición.
- Importe fijo o ajuste porcentual.
- Rango de fechas aplicable.
- Días de la semana aplicables.
- Cantidad mínima de noches opcional.
- Cantidad máxima de noches opcional.
- Cantidad mínima de huéspedes opcional.
- Cantidad máxima de huéspedes opcional.
- Prioridad.
- Estado.

#### Pricing Snapshot

- Plan o lista seleccionada.
- Precio por noche.
- Desglose por fecha.
- Descuentos aplicados.
- Ajustes aplicados.
- Precio sugerido.
- Precio acordado.
- Motivo del precio personalizado, cuando corresponda.
- Moneda.
- Total.
- Usuario que confirmó el precio.
- Fecha y hora de creación.

### 6. Reglas de negocio

- Toda lista de precios pertenece exactamente a un Negocio.
- Una lista de precios puede asignarse a uno o varios Resources.
- Un Resource puede tener varias opciones tarifarias aplicables.
- El sistema debe sugerir una tarifa aplicable, pero el usuario puede seleccionar otra opción válida.
- El catálogo tarifario del Negocio incluye planes activos y archivados para lectura administrativa e histórica. Para seleccionar una tarifa de Booking, Pricing filtra únicamente planes activos, asignados al Resource activo solicitado y cuya vigencia cubre completamente la estadía; las tarifas estacionales afectan el cálculo posterior, no la seleccionabilidad.
- Siempre debe existir una opción de precio personalizado cuando el Negocio la tenga habilitada.
- Todo precio personalizado requiere motivo.
- El precio acordado debe congelarse al confirmar la reserva.
- Los cambios posteriores en listas o reglas no modifican reservas confirmadas.
- Un cambio de fechas o Resource puede requerir recalcular el precio.
- El usuario puede mantener el precio anterior o aceptar el nuevo cálculo, dejando auditoría.
- El precio debe mostrar un desglose comprensible por noche o concepto.
- La moneda debe ser válida para el Negocio.
- No se eliminan físicamente listas o reglas utilizadas históricamente.
- Pricing y Payment Plan mantienen responsabilidades separadas: Payment Plan no muta PricingSnapshot, pero usa su moneda y total acordado como referencia inmutable.
- Pricing y pagos reales son conceptos independientes.

### 7. Estados

Para listas o planes:

- Borrador.
- Activo.
- Inactivo.
- Archivado.

Para reglas:

- Activa.
- Inactiva.
- Archivada.

Para Pricing Snapshot:

- Inmutable una vez asociado a una reserva confirmada.

### 8. Eventos

- `PricingPlanCreated`.
- `PricingPlanUpdated`.
- `PricingPlanActivated`.
- `PricingPlanDeactivated`.
- `PricingPlanArchived`.
- `PricingRuleCreated`.
- `PricingRuleUpdated`.
- `PricingCalculated`.
- `CustomPriceApplied`.
- `PricingSnapshotCreated`.
- `BookingPriceRecalculated`.

### 9. Relaciones

- Pricing pertenece a Business.
- Las listas pueden asignarse a uno o varios Resource.
- Booking solicita cálculos a Pricing.
- Booking conserva una referencia al Pricing Snapshot.
- Pricing no depende de Payment.
- Pricing no depende de Availability para calcular un precio.
- Payment Plan no modifica el precio acordado y deriva moneda y total del Pricing Snapshot vigente de la Booking.

No se definen aún las cardinalidades técnicas de base de datos.

### 10. Capacidades

- Crear lista de precios.
- Actualizar lista de precios.
- Duplicar lista de precios.
- Activar o desactivar lista.
- Archivar lista.
- Asignar lista a Resources.
- Crear y actualizar reglas.
- Activar o desactivar reglas.
- Consultar opciones tarifarias aplicables.
- Listar el catálogo tarifario tenant-scoped mediante `GET /api/businesses/:businessId/rate-plans`; con `resourceId`, `checkIn` y `checkOut` informados conjuntamente, devolver solo opciones seleccionables según las reglas de Pricing.
- Calcular precio sugerido.
- Aplicar precio personalizado.
- Generar Pricing Snapshot.
- Recalcular precio por cambio de fechas o Resource.
- Consultar desglose del precio.

### 11. Restricciones

- No almacenar un único precio fijo directamente en Resource.
- No recalcular automáticamente reservas confirmadas.
- No permitir precios negativos.
- No permitir reglas activas con vigencias inválidas.
- No eliminar información histórica usada en reservas.
- No incluir IA, análisis de competidores ni revenue management automático en el MVP.
- No mezclar Pricing con planes de pago o transacciones.
- No permitir un Pricing Snapshot mutable después de confirmar la reserva.
- El detalle individual de Rate Plan queda diferido en el MVP porque el listado devuelve el contrato público completo requerido por catálogo, selección, cálculo y Confirm Booking.
- PricingSnapshot permanece interno en el MVP y no se expone mediante Booking Detail; una futura necesidad de lectura requiere un contrato público explícito.

### 12. Pendientes

- Jerarquía exacta cuando coinciden varias reglas.
- Catálogo inicial de tipos de regla.
- Tratamiento de impuestos.
- Política de redondeo monetario.
- Alcance preciso de promociones dentro del MVP.
- Soporte de múltiples monedas.
- Forma exacta de asignación entre planes y Resources.
- Tratamiento de precios por huésped adicional.
- Tratamiento de feriados y fechas especiales.

## Availability

### Contrato MVP base

AVL-001 — Check Availability está completada mediante `GET /api/businesses/:businessId/availability?resourceId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD`. Availability es derivada: no tiene tabla ni persiste una verdad propia. Calcula cada consulta con Resource, Booking y Block, usando intervalos semiabiertos `[from, to)` e intersección `existing.start < requested.to AND existing.end > requested.from`.

Solo un Resource `ACTIVE` puede resultar `AVAILABLE`; `OUT_OF_SERVICE` y `ARCHIVED` resultan `UNAVAILABLE`. Bloquean una Booking `PENDING`, `CONFIRMED` o `IN_PROGRESS`; no bloquean `DRAFT`, `COMPLETED`, `CANCELLED` ni `NO_SHOW`. Un Block intersectante no cancelado bloquea: `SCHEDULED` y efectivo `ACTIVE`; `CANCELLED` y `COMPLETED` no bloquean futuro. No hay Pricing, Payments, overbooking configurable, buffers configurables, capacidad de huéspedes, auto-assignment ni alternativas inteligentes en este slice.

El resultado mínimo es `AVAILABLE` o `UNAVAILABLE`, con razones sin duplicados: `RESOURCE_OUT_OF_SERVICE`, `RESOURCE_ARCHIVED`, `BOOKING_CONFLICT` y `BLOCK_CONFLICT`. `AVL-001` consulta un Resource por `businessId`, `resourceId`, `from` y `to` estrictos `YYYY-MM-DD`, sin persistir, Pricing ni Payments. `AVL-002` está completada como una vista derivada por Resource/fecha; `AVL-003` está completada como configuración de reglas por Business, con defaults compatibles; `AVL-004` reutilizará esta misma semántica antes de confirmar Booking.

### Contrato AVL-002 — Availability Calendar

`GET /api/businesses/:businessId/availability/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD[&resourceId=<uuid>]` devuelve una matriz derivada por Resource y día, sin persistir el calendario ni crear una segunda lógica de disponibilidad. El rango global es semiabierto `[from, to)`, con `from` incluido, `to` excluido, `to > from` y un máximo de 31 días; cada celda `date` representa `[date, date + 1 day)` y reutiliza exactamente las reglas, estados y razones de AVL-001.

Sin `resourceId`, el calendario incluye todos los Resources del Business —incluidos `OUT_OF_SERVICE` y `ARCHIVED`, que se muestran como `UNAVAILABLE` con su razón— en el orden estable existente `sortOrder ASC`, `name ASC`, `id ASC`. Con `resourceId`, devuelve solo el Resource del Business; uno inexistente o de otro Business se oculta como inexistente. Los días se ordenan ascendentemente y las razones no se duplican ni cambian de orden.

La respuesta contiene `from`, `to` y `resources[]`; cada elemento tiene `resourceId` y `days[]`, y cada día tiene `date`, `status` (`AVAILABLE` o `UNAVAILABLE`) y `reasons[]`. Booking se evalúa individualmente por Resource con los mismos estados bloqueantes de AVL-001; un Block intersectante aplica la misma semántica vigente. La implementación carga el scope de Resources y los conflictos de Booking y Block para el rango completo, y deriva la matriz en memoria de forma determinista, sin invocar AVL-001 por cada celda ni incurrir en consultas N×M.

Los errores de AVL-002 son `400` para IDs, fechas o rango inválidos —incluido un rango superior a 31 días— y `404` para Business o Resource inexistente/cross-tenant. El comportamiento de Business no operativo será el mismo de AVL-001. Quedan fuera Pricing, Payments, capacidad, buffers configurables, overbooking configurable, recomendaciones, auto-asignación, Booking, caché persistente, métricas y Dashboard.

Secuencia: BKG-001..004 Draft → AVL-001 → AVL-002 → AVL-003 → AVL-004 → Booking PENDING/Confirm → BKG-005 → BKG-006. Confirmación, transición a PENDING, Pricing Snapshot, Payments y cancelaciones permanecen fuera de este contrato.

### Contrato AVL-003 — Availability Rules

`AVL-003` está completada como una configuración única por Business, consultable y actualizable mediante `GET` y `PATCH /api/businesses/:businessId/availability-rules`. La configuración no persiste disponibilidad ni reemplaza la derivación de AVL-001/AVL-002: ambos casos de uso consumen la misma regla efectiva para ese Business.

La ausencia de registro usa defaults compatibles con el comportamiento vigente: `pendingBlocksAvailability: true`, `bufferBeforeDays: 0` y `bufferAfterDays: 0`. La configuración contiene únicamente esos tres campos: `pendingBlocksAvailability` es booleano; ambos buffers son enteros no negativos expresados en días. No se permite configurar estados de Booking distintos de `PENDING`, ni estado de Resource, Block, Pricing, Payments, capacidad, alternativas o auto-asignación.

`pendingBlocksAvailability: true` hace que `PENDING` bloquee, junto con `CONFIRMED` e `IN_PROGRESS`; con `false`, `PENDING` no bloquea. Los demás estados mantienen exactamente la semántica de AVL-001. Los buffers aplican solo a Booking: amplían su intervalo `[checkInDate, checkOutDate)` antes y después sin cambiar la intersección semiabierta, por lo que la evaluación será contra `[checkInDate - bufferBeforeDays, checkOutDate + bufferAfterDays)`. Un Block conserva siempre sus instantes exactos `[startsAt, endsAt)` y no recibe buffers.

No se requiere zona horaria para AVL-003: los buffers usan la misma granularidad diaria de las fechas de Booking. AVL-001/AVL-002 conservan sus resultados actuales mientras ambos buffers permanezcan en `0`.

### Contrato AVL-004 — Overbooking Validation

`AVL-004` define una validación interna reutilizable para Booking; no expone un endpoint público independiente ni persiste resultados. Recibe `businessId`, uno o más `resourceIds` únicos y un rango estricto `checkInDate`/`checkOutDate` en formato `YYYY-MM-DD`, con intervalo semiabierto `[checkInDate, checkOutDate)` y salida posterior a entrada. Confirm Booking la invoca inmediatamente antes de cambiar el estado; esa transición pertenece a Booking y no a AVL-004.

La validación reutiliza la semántica central y los contratos públicos de AVL-001, AVL-002 y AVL-003, sin duplicar intersecciones: verifica Business y Resources dentro del mismo tenant, estado operativo del Resource, Bookings bloqueantes, Blocks efectivos y la regla efectiva del Business. Aplica `pendingBlocksAvailability` y los buffers diarios solo a Bookings; los Blocks conservan sus instantes exactos. Un Resource `OUT_OF_SERVICE` o `ARCHIVED`, una Booking bloqueante o un Block efectivo intersectante producen conflicto. Con overbooking deshabilitado, cualquier conflicto bloqueante hace fallar la validación; sin conflictos, el resultado es válido.

El resultado contractual contiene `valid` y `conflicts[]`, con un elemento por Resource en conflicto formado por `resourceId` y `reasons[]`. Las razones reutilizan exactamente `RESOURCE_OUT_OF_SERVICE`, `RESOURCE_ARCHIVED`, `BOOKING_CONFLICT` y `BLOCK_CONFLICT`, sin duplicados y en el orden determinista vigente de Availability. No hay auto-asignación, cálculo de Pricing, Payments, Pricing Snapshot ni escritura de Availability.

La Definition of Done de AVL-004 requiere una capacidad interna reusable que cubra uno y múltiples Resources, tenant isolation, reglas efectivas, intersección semiabierta y buffers de Booking; resultado determinista por Resource; y evidencia unitaria, de integración y de su consumo por Confirm Booking. Quedan fuera de este contrato la transición de Booking, un endpoint público, configuración que habilite overbooking, capacidad, alternativas y cualquier persistencia.

### 1. Propósito

Determinar si uno o más Resources pueden reservarse durante un período específico, considerando reservas, bloqueos y estado operativo del Resource.

### 2. Responsabilidad

Availability es responsable de:

- Consultar si un Resource está disponible para un rango de fechas.
- Buscar todos los Resources disponibles para un rango de fechas.
- Detectar conflictos con reservas existentes.
- Detectar conflictos con bloqueos.
- Excluir Resources inactivos, fuera de servicio o archivados.
- Mostrar el motivo de una indisponibilidad.
- Sugerir alternativas disponibles.
- Proveer información a Booking, Calendario, Dashboard y futuras integraciones.
- Revalidar disponibilidad en el momento de confirmar una reserva.

### 3. No Responsabilidad

Availability no:

- Crea ni modifica reservas.
- Crea ni modifica bloqueos.
- Calcula precios.
- Registra pagos.
- Administra clientes.
- Decide qué tarifa utilizar.
- Almacena un calendario materializado en el MVP.
- Realiza overbooking automático.
- Modifica estados de Resource.

### 4. Conceptos principales

- Consulta de disponibilidad.
- Rango de fechas.
- Conflicto.
- Reserva bloqueante.
- Bloqueo.
- Resource disponible.
- Resource no disponible.
- Alternativa.
- Capacidad requerida.
- Estado operativo del Resource.
- Política de bloqueo de reservas pendientes.

### 5. Información administrada

Availability no administra información persistente propia en el MVP.

Consume información de:

#### Resource

- Id.
- Negocio.
- Estado.
- Capacidad máxima.
- Tipo.
- Orden de visualización.

#### Booking

- Resource asociado.
- Fecha de entrada.
- Fecha de salida.
- Estado operativo.
- Indicación de si bloquea disponibilidad.

#### Block

- Resource asociado.
- Fecha de inicio.
- Fecha de finalización.
- Estado.
- Tipo de bloqueo.

#### Business

- Política sobre reservas pendientes.
- Horario estándar de check-in.
- Horario estándar de check-out.
- Configuración de overbooking.

Availability produce resultados calculados, no entidades persistentes.

### 6. Reglas de negocio

- Todo cálculo debe realizarse dentro de un único Negocio.
- Un Resource solo puede considerarse disponible si está Activo.
- Un Resource Fuera de servicio o Archivado no puede reservarse.
- Las reservas en estado Borrador no bloquean disponibilidad.
- Las reservas Confirmadas bloquean disponibilidad.
- Las reservas En curso bloquean disponibilidad.
- Las reservas Canceladas no bloquean disponibilidad.
- Las reservas Finalizadas no bloquean disponibilidad futura.
- Las reservas No Show dejan de bloquear disponibilidad una vez liberadas según la operación.
- Las reservas Pendientes pueden bloquear o no según la configuración del Negocio.
- Los Block activos o programados que intersectan el período solicitado bloquean disponibilidad.
- La validación debe repetirse al confirmar una reserva.
- No debe existir doble reserva para el mismo Resource y período, salvo que el Negocio tenga overbooking habilitado.
- El overbooking estará deshabilitado por defecto.
- Un Resource es indivisible en el MVP.
- La disponibilidad se calcula a partir de datos actuales; no se almacena como fuente independiente de verdad.
- El resultado debe explicar el motivo de la indisponibilidad.
- Cuando sea posible, debe devolver Resources alternativos.
- Las consultas pueden considerar capacidad mínima requerida.
- La lógica debe tratar correctamente la salida y entrada el mismo día según horarios operativos.

### 7. Estados

Availability no tiene estados propios persistentes.

Los resultados posibles de una consulta son:

- Disponible.
- No disponible.
- Disponible con advertencia.

“Disponible con advertencia” puede utilizarse cuando existe una condición configurable, como una reserva pendiente que no bloquea pero requiere atención.

### 8. Eventos

Availability no genera eventos de dominio persistentes por una consulta simple.

Puede producir o participar en los siguientes eventos o resultados operativos:

- `AvailabilityChecked`.
- `AvailabilityConflictDetected`.
- `AvailabilityRevalidated`.
- `AlternativeResourcesFound`.
- `OverbookingAttemptDetected`.

Availability consume cambios originados por:

- `BookingCreated`.
- `BookingConfirmed`.
- `BookingDatesChanged`.
- `BookingResourceChanged`.
- `BookingCancelled`.
- `CheckInCompleted`.
- `CheckOutCompleted`.
- `BlockCreated`.
- `BlockUpdated`.
- `BlockCancelled`.
- `ResourceActivated`.
- `ResourceTakenOutOfService`.
- `ResourceArchived`.

No se asume una implementación técnica basada en mensajería o event bus.

### 9. Relaciones

- Availability consulta Resource.
- Availability consulta Booking.
- Availability consulta Block.
- Availability utiliza configuración de Business.
- Booking depende de Availability para validar creación, modificación y confirmación.
- Calendario consume resultados de Availability.
- Dashboard puede consumir agregaciones derivadas de Availability.
- Pricing no depende de Availability para calcular precios.
- Payment no interactúa con Availability.

No se definen aún las cardinalidades técnicas de base de datos.

### 10. Capacidades

- Consultar disponibilidad de un Resource.
- Buscar Resources disponibles.
- Validar conflicto.
- Revalidar disponibilidad antes de confirmar.
- Explicar motivo de indisponibilidad.
- Buscar alternativas.
- Filtrar por capacidad.
- Consultar disponibilidad por tipo de Resource.
- Consultar disponibilidad para una fecha específica.
- Consultar disponibilidad para un rango de fechas.
- Validar intento de overbooking.
- Proveer información para vista calendario.
- Proveer información para indicadores de ocupación.

### 11. Restricciones

- No persistir disponibilidad como fuente de verdad en el MVP.
- No duplicar reglas de bloqueo dentro de Booking o Calendario.
- No consultar datos de otros Negocios.
- No considerar un Resource no activo como disponible.
- No permitir que una consulta inicial garantice la confirmación; siempre debe revalidarse.
- No implementar reserva parcial de Resource.
- No implementar asignación automática inteligente de Resources en el MVP.
- No implementar optimización por precio, rentabilidad o huecos de ocupación en el MVP.
- No incluir lógica de Pricing.
- No incluir lógica de Payment.

### 12. Pendientes

- Regla exacta de solapamiento considerando hora de check-in y check-out.
- Momento exacto en que un No Show libera disponibilidad.
- Comportamiento definitivo de reservas Pendientes.
- Alcance del overbooking en el MVP.
- Orden de alternativas disponibles.
- Política de buffers entre reservas.
- Rendimiento objetivo y estrategia de caché.
- Tratamiento de cambios simultáneos por múltiples usuarios.

## Contact

### 1. Propósito

Representar a la persona con la que el Negocio mantiene una relación comercial u operativa para gestionar reservas, comunicaciones e historial.

### 2. Responsabilidad

Contact es responsable de:

- Mantener la identidad básica del contacto.
- Conservar sus datos de comunicación.
- Relacionarse con reservas como responsable principal.
- Permitir búsquedas rápidas durante la creación de una reserva.
- Mantener historial de reservas y actividad asociada.
- Evitar la duplicación innecesaria de información.
- Permitir crear un contacto mínimo durante el flujo de reserva.

### 3. No Responsabilidad

Contact no:

- Representa automáticamente a todos los huéspedes.
- Administra pagos.
- Calcula precios.
- Determina disponibilidad.
- Crea reservas.
- Almacena información perteneciente a otros Negocios.
- Actúa como CRM avanzado en el MVP.
- Administra campañas, embudos comerciales o automatizaciones de marketing.

### 4. Conceptos principales

- Contacto.
- Contacto responsable.
- Huésped.
- Datos de contacto.
- Historial.
- Nota.
- Identidad.
- Estado.
- Duplicado potencial.

### 5. Información administrada

#### Identidad

- Id.
- Negocio.
- Nombre.
- Apellido opcional.
- Nombre completo.
- Tipo de documento opcional.
- Número de documento opcional.

#### Contacto

- Teléfono.
- WhatsApp.
- Email opcional.
- País opcional.
- Ciudad opcional.

#### Información operativa

- Observaciones.
- Preferencias o notas simples.
- Estado.
- Fecha de creación.
- Fecha de modificación.
- Usuario creador.
- Usuario modificador.

#### Datos derivados

- Cantidad de reservas.
- Última reserva.
- Próxima reserva.
- Total histórico de reservas.

Los datos derivados no deben convertirse necesariamente en campos persistentes en el MVP.

### 6. Reglas de negocio

- Todo Contact pertenece exactamente a un Negocio.
- El mismo individuo puede existir como Contact independiente en distintos Negocios.
- Una reserva debe tener exactamente un Contact responsable antes de confirmarse.
- Un Contact mínimo puede crearse con nombre y al menos un medio de contacto.
- El teléfono o WhatsApp debe priorizarse en el mercado inicial.
- Los huéspedes adicionales no necesitan convertirse en Contact.
- No eliminar físicamente Contacts con historial.
- Un Contact archivado conserva su historial.
- El sistema debe permitir buscar por nombre, teléfono, email y documento cuando esté disponible.
- Debe evitarse crear duplicados evidentes, pero la deduplicación automática avanzada queda fuera del MVP.
- Contact y huésped son conceptos distintos.
- Un Contact puede ser responsable de múltiples reservas.

### 7. Estados

- Activo.
- Inactivo.
- Archivado.

### 8. Eventos

- `ContactCreated`.
- `ContactUpdated`.
- `ContactActivated`.
- `ContactDeactivated`.
- `ContactArchived`.
- `PotentialDuplicateDetected`.
- `ContactLinkedToBooking`.

### 9. Relaciones

- Contact pertenece a Business.
- Contact puede ser responsable de múltiples Booking.
- Booking referencia un Contact responsable.
- Booking puede contener una lista de huéspedes que no son Contact.
- Payment puede registrar al pagador como referencia informativa, pero no convierte automáticamente a esa persona en Contact.
- Contact puede tener Activity, Comments, Files y Audit como capacidades compartidas futuras o transversales.

No se definen aún las cardinalidades técnicas de base de datos.

### 10. Capacidades

- Crear Contact.
- Crear Contact mínimo durante una reserva.
- Actualizar Contact.
- Activar Contact.
- Desactivar Contact.
- Archivar Contact.
- Consultar Contact.
- Buscar Contact.
- Consultar historial de reservas.
- Añadir observaciones.
- Detectar posible duplicado.
- Asociar Contact a Booking.

### 11. Restricciones

- No compartir Contacts entre Negocios.
- No eliminar físicamente Contacts con historial.
- No exigir información legal o documental completa para crear una reserva.
- No exigir email si existe otro medio de contacto válido.
- No modelar a cada huésped como Contact en el MVP.
- No incluir CRM, campañas, segmentación comercial ni automatizaciones de marketing en el MVP.
- No almacenar contraseñas, datos bancarios ni información sensible de pago dentro de Contact.
- No fusionar automáticamente duplicados en el MVP.

### 12. Pendientes

- Campos mínimos exactos para crear un Contact.
- Normalización y validación de teléfonos.
- Tipos de documento iniciales.
- Reglas exactas para detectar duplicados.
- Proceso de fusión manual de duplicados.
- Política de retención y privacidad de datos personales.
- Información exacta de huéspedes adicionales.
- Posibilidad futura de contactos corporativos o empresas.

## Booking

### 1. Propósito

Representar y administrar el acuerdo comercial y operativo mediante el cual un Contact reserva uno o más Resources de un Negocio durante un período determinado, bajo condiciones económicas específicas.

### 2. Responsabilidad

Booking es responsable de mantener la identidad de la reserva, relacionarla con un Negocio, Contact responsable y uno o más Resources, administrar fechas y estado operativo, y coordinar confirmación, cancelación, check-in, check-out y finalización.

También referencia el Pricing Snapshot acordado, se relaciona con plan de pagos y pagos recibidos, mantiene huéspedes adicionales y observaciones operativas, conserva historial y auditoría y bloquea disponibilidad según estado y configuración del Negocio. El número visible secuencial dentro del Negocio continúa como decisión aprobada pendiente de implementación.

### 3. No Responsabilidad

Booking no calcula disponibilidad ni precios, no administra listas de precios, no registra transacciones financieras, no administra clientes fuera del contexto de la reserva, no envía notificaciones por sí mismo y no administra inventario, limpieza o mantenimiento.

Tampoco elimina historial, modifica automáticamente el Pricing Snapshot de una reserva confirmada ni implementa un CRM de consultas en el MVP.

### 4. Conceptos principales

- Reserva.
- Número visible de reserva.
- Contact responsable.
- Huésped.
- Resource reservado.
- Rango de estadía.
- Estado operativo.
- Estado financiero derivado.
- Pricing Snapshot.
- Plan de pagos.
- Observación.
- Check-in.
- Check-out.
- Cancelación.
- No Show.
- Historial.
- Borrador.
- Confirmación.

### 5. Información administrada

#### Identidad

- Id interno, Negocio y Estado operativo.
- Fecha de creación, Fecha de modificación, Usuario creador, Usuario modificador.

#### Estadía

- Fecha de entrada y Fecha de salida opcionales en el borrador, ambas como `YYYY-MM-DD` cuando existen.
- Cantidad de adultos y menores opcionales en el borrador. Las validaciones de capacidad y huéspedes adicionales quedan fuera de este primer slice.

#### Relaciones

- Contact responsable opcional y cero o un Resource en el borrador mediante `BookingResource`; el DTO conserva `resourceIds` por compatibilidad, con longitud máxima de uno.
- Pricing Snapshot, plan de pagos y pagos relacionados se incorporan fuera de este primer slice.
- Archivos adjuntos, comentarios, actividad y auditoría.

#### Información operativa

- Origen de la reserva, observaciones, motivo de cancelación o No Show cuando corresponda.
- Fecha y hora real de check-in y check-out, y usuarios que los realizaron.

#### Información económica referenciada

- Precio acordado, Moneda, Total de la reserva, Estado financiero derivado y Saldo pendiente derivado.

Booking referencia esta información, pero Pricing y Payment conservan sus responsabilidades propias.

### 6. Reglas de negocio

- Toda Booking pertenece exactamente a un Negocio y debe tener un Contact responsable y al menos un Resource antes de confirmarse.
- En el MVP, los Resources reservados son unidades indivisibles; una Booking puede contener cero o un Resource, nunca más de uno.
- El primer slice `BKG-001` a `BKG-004` crea y modifica exclusivamente `DRAFT`. Un borrador puede existir con cualquier combinación incompleta de Contact, Resources, fechas y huéspedes, incluido un body vacío al crearse.
- Si ambas fechas existen en un `DRAFT`, la fecha de salida debe ser posterior a la fecha de entrada. Puede existir solo una fecha. Adultos y menores, cuando existen, son enteros mayores o iguales a cero.
- En el primer slice, `contactId` debe pertenecer al mismo Negocio; `resourceIds` mantiene compatibilidad de array pero su longitud máxima es uno y, cuando existe, pertenece al mismo Negocio. Un Resource `ARCHIVED` no puede asociarse a un nuevo borrador; `OUT_OF_SERVICE` puede quedar asociado, sin que ello lo haga reservable o confirmable. Si existe `children` junto con un Resource, no supera `capacityMaximumChildren`; si existen adultos y menores, su total no supera `capacityMaximum`.
- `notes` es opcional, se normaliza con `trim`, una cadena vacía se guarda como `null` y no supera 1000 caracteres.
- Un borrador puede existir con información incompleta; una reserva pendiente debe contener la información mínima para ser evaluada.
- Una reserva confirmada debe tener Contact, fechas válidas, Resource disponible y Pricing Snapshot; Availability debe revalidarse inmediatamente antes de confirmar.
- Confirmada y En curso bloquean disponibilidad; Cancelada y Finalizada no bloquean disponibilidad futura; Pendiente puede bloquear según configuración y Borrador nunca bloquea.
- El precio se congela mediante Pricing Snapshot al confirmar. Cambiar fechas o Resource requiere revisar disponibilidad y puede requerir recálculo; el usuario debe mantener el precio anterior o aceptar el nuevo, dejando auditoría.
- Toda modificación relevante debe generar auditoría. Booking y Payment son independientes; una reserva puede existir sin pagos o tener múltiples pagos; el estado financiero no se mezcla con el operativo.
- Ninguna Booking se elimina físicamente y una cancelada conserva su historial.
- Check-in y check-out son eventos, no estados; No Show es distinto de Cancelada; Finalizada es irreversible en el MVP.
- Los huéspedes adicionales no necesitan ser Contacts. El número visible es único dentro del Negocio.
- Crear o actualizar un `DRAFT` no consulta Availability ni Blocks, no valida conflictos, no calcula Pricing, no crea Pricing Snapshot ni Payments y no bloquea disponibilidad.

### 7. Estados

Estados operativos: Borrador, Pendiente, Confirmada, En curso, Finalizada, Cancelada y No Show.

Valores persistidos: `DRAFT`, `PENDING`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` y `NO_SHOW`.

En `BKG-001` a `BKG-004` el estado inicial es `DRAFT` y solo un `DRAFT` puede modificarse. El endpoint de actualización no modifica el estado.

Transiciones conceptuales:

- Borrador → Pendiente o Cancelada.
- Pendiente → Confirmada o Cancelada.
- Confirmada → En curso mediante `CheckInCompleted`, Cancelada o No Show.
- En curso → Finalizada mediante `CheckOutCompleted`.

No se permite Finalizada → estados anteriores, Cancelada → Confirmada, No Show → En curso, En curso → Pendiente ni eliminación física.

Estado financiero derivado: Sin pagos, Pago parcial, Pagada, Reembolsada y Con saldo a favor (futuro). No forma parte de la máquina de estados operativa.

### 8. Eventos

- `BookingDraftCreated`, `BookingCreated`, `BookingUpdated`, `BookingPending`, `BookingConfirmed`, `BookingCancelled` y `BookingMarkedNoShow`.
- `BookingDatesChanged`, `BookingResourceChanged`, `BookingContactChanged`, `BookingPricingChanged` y `BookingGuestsChanged`.
- `CheckInCompleted`, `CheckOutCompleted`, `BookingFinalized`, `BookingNoteAdded` y `BookingAttachmentAdded`.

Booking consume resultados o capacidades de `AvailabilityChecked`, `AvailabilityRevalidated`, `PricingCalculated`, `PricingSnapshotCreated`, `PaymentRegistered`, `PaymentVoided`, `BlockCreated` y `ResourceTakenOutOfService`.

No se asume una implementación técnica basada en mensajería o event bus.

### 9. Relaciones

- Booking pertenece a Business y en `DRAFT` puede no tener Contact responsable.
- Puede asociarse a cero o un Resource en `DRAFT`; depende de Availability y solicita cálculos a Pricing antes de confirmar.
- Conserva un Pricing Snapshot, puede tener plan de pagos y múltiples Payment, huéspedes adicionales, Activity, Comments, Files y Audit.
- No comparte información entre Negocios.

No se definen aún las cardinalidades técnicas de base de datos.

### 10. Capacidades

- `BKG-001`: crear un `DRAFT` mediante `POST /api/businesses/:businessId/bookings`.
- `BKG-002`: consultar una Booking del Negocio mediante `GET /api/businesses/:businessId/bookings/:bookingId`.
- `BKG-003`: listar Bookings del Negocio mediante `GET /api/businesses/:businessId/bookings`, con filtros iniciales opcionales `status`, `contactId` y `resourceId`, y orden `createdAt DESC`, `id ASC`.
- `BKG-004`: actualizar parcialmente un `DRAFT` mediante `PATCH /api/businesses/:businessId/bookings/:bookingId`; los campos omitidos se preservan, `contactId` y fechas `null` limpian, `resourceIds: []` elimina asociaciones y su presencia reemplaza atómicamente la única asociación permitida.
- `BKG-005 — Booking Lifecycle`: administra `DRAFT → PENDING`, `PENDING → CONFIRMED` y cancelación de estados permitidos. Submit exige Contact responsable, exactamente un Resource y fechas completas válidas; valida Availability antes de crear un estado potencialmente bloqueante. Confirm exige además Pricing Snapshot y revalida AVL-004 inmediatamente antes de persistir `CONFIRMED`. La confirmación debe mantener la garantía de concurrencia definida por BR-062.
- Asociar plan de pagos, registrar observaciones, adjuntar archivos, hacer check-in, check-out y finalizar.
- Consultar historial, duplicar una reserva como base para otra y consultar por fecha, Contact, Resource, estado o número visible.

### 11. Restricciones

- No confirmar sin revalidar Availability, Contact responsable, exactamente un Resource, fechas válidas y Pricing Snapshot.
- BKG-001 a BKG-004 no implementan transiciones de estado. Availability y la validación de overbooking ya están disponibles mediante AVL-001 a AVL-004. BKG-005 incorpora el lifecycle `DRAFT → PENDING → CONFIRMED` y cancelación; BKG-006 mantiene Timeline. Pricing Snapshot, check-in/check-out, capacidad de huéspedes y Payments conservan sus alcances propios.
- No modificar silenciosamente el precio confirmado, eliminar físicamente una reserva ni mezclar estado operativo y financiero.
- No permitir doble reserva salvo política explícita de overbooking, ni usar check-in/check-out como estados persistentes independientes.
- No crear huéspedes como Contacts automáticamente, ni incluir CRM de consultas, notificaciones, WhatsApp, marketplace, inventario, limpieza o mantenimiento dentro de Booking.
- No permitir cambios de Negocio ni reutilizar números visibles de reservas canceladas o archivadas.

### 12. Pendientes

- La información mínima para pasar de `DRAFT` a `PENDING` queda definida por BKG-005: Contact responsable, exactamente un Resource y rango completo `[checkInDate, checkOutDate)` válido.
- Regla definitiva para confirmar automáticamente tras un primer pago.
- `PENDING` consume la regla efectiva `pendingBlocksAvailability` de Availability; al entrar en `PENDING` se valida disponibilidad con la misma semántica central.
- Política de cancelación y penalizaciones.
- Tratamiento de reembolsos.
- Regla exacta de No Show y liberación de disponibilidad.
- Reglas de modificación de reservas en curso.
- Tratamiento de early check-in y late check-out.
- BKG-005 valida conjuntamente todos los Resources de la Booking mediante la capacidad reutilizable AVL-004 antes de crear un estado bloqueante o confirmar.
- Numeración inicial y formato visible, pendiente antes de confirmación.
- Validaciones de adultos, menores y capacidad.
- Campos obligatorios de huéspedes adicionales.
- La semántica temporal MVP usa fechas `YYYY-MM-DD` e intervalos semiabiertos; horarios exactos y tratamiento horario avanzado permanecen fuera de este slice.
- Política de archivado.
- Alcance de duplicar reserva en el MVP.

## Payment

### 1. Propósito

Administrar los acuerdos de cobro y los pagos reales asociados a una Booking, permitiendo adelantos, cuotas, pagos parciales, comprobantes, anulaciones y consulta de saldo.

### 2. Responsabilidad

Payment administra el plan de pagos acordado, sus cuotas, los pagos reales recibidos y su aplicación parcial o total a obligaciones previstas.

PAY-001 y PAY-002 registran método, fecha, referencia y actor; distribuyen Payments entre cuotas y derivan el estado de cada cuota. PAY-004 expone el saldo financiero derivado por Booking. Historial público, comprobantes, anulación y reembolso pertenecen a capacidades posteriores.

### 3. No Responsabilidad

Payment no calcula precios ni administra tarifas o Pricing Snapshot, disponibilidad, confirmación o cancelación de reservas.

No emite facturación electrónica, administra contabilidad general, realiza conciliación bancaria automática ni procesa pagos online en el MVP; tampoco almacena credenciales bancarias ni datos sensibles de tarjetas.

### 4. Conceptos principales

- Plan de pagos, Pago previsto, Adelanto, Cuota, Saldo y Vencimiento.
- Pago real, Transacción, Pago parcial, Método de pago y Comprobante.
- Anulación, Reembolso, Estado financiero derivado, Monto aplicado y Monto pendiente.

### 5. Información administrada

#### Plan de pagos

- Id, Negocio, Booking, Total acordado y Moneda.
- Fecha de creación, Fecha de modificación, Usuario creador y Usuario modificador.
- PAY-002 no persiste tipo ni estado del plan; esas extensiones son futuras.

#### Pago previsto

- Id, Plan de pagos, Monto, Fecha de vencimiento opcional y Orden.
- El estado se deriva de monto, aplicaciones y vencimiento; no se persiste.

#### Pago real

- Id, Negocio, Booking, Fecha y hora, Monto, Moneda, Método de pago, Referencia y observación opcionales.
- Usuario que registró el pago, estado `RECORDED`, clave y huella de idempotencia y fecha de creación.
- Comprobante, anulación y reembolso son extensiones futuras.

#### Aplicación de pago

- Pago real, Pago previsto relacionado y Monto aplicado.

#### Información derivada

- Total pagado, Total pendiente, Total vencido, Estado financiero y Próximo vencimiento.

La información derivada puede calcularse y no debe necesariamente persistirse como fuente de verdad.

### 6. Reglas de negocio

- Todo plan de pagos pertenece exactamente a una Booking y a un Negocio. Una Booking puede existir sin plan de pagos o pagos reales. El plan requiere PricingSnapshot, deriva de él moneda y total y nunca lo modifica.
- PAY-002 admite entre 1 y 100 pagos previstos con montos positivos; su suma coincide con el total acordado. Los vencimientos son opcionales y el orden de entrada se conserva. Las plantillas quedan fuera de PAY-002.
- Un pago real puede cubrir total o parcialmente un pago previsto; uno previsto puede cubrirse mediante varios reales y un real puede distribuirse entre varios previstos si las reglas lo permiten.
- PAY-002 usa un único plan por Booking con entre 1 y 100 pagos previstos. La suma del plan coincide con el total del Pricing Snapshot. La distribución automática consume primero el vencimiento más antiguo, deja las cuotas sin vencimiento al final y usa el orden del plan como desempate. Los pagos históricos se aplican por `paidAt`, `createdAt` e `id`. El plan solo puede reemplazarse antes de que exista una aplicación.
- PAY-002 crea o reemplaza el plan únicamente para Bookings `CONFIRMED` o `IN_PROGRESS`; la lectura histórica se conserva cuando existe el plan.
- PAY-001 admite los métodos cerrados `CASH`, `BANK_TRANSFER`, `CARD` y `OTHER`; `CARD` registra un pago externo y no procesa ni almacena datos sensibles.
- Ningún pago real se elimina físicamente. La anulación de un pago incorrecto requiere una capacidad futura con motivo y auditoría.
- El estado financiero se calcula desde pagos reales válidos. Registrar un pago no cambia el precio ni confirma una Booking, salvo regla explícita del Negocio.
- PAY-001 registra únicamente pagos `RECORDED`; una futura anulación deberá excluir esos pagos del saldo. El monto es mayor que cero y la moneda deriva del PricingSnapshot de la Booking.
- Comprobantes y plantillas son capacidades futuras y no forman parte de PAY-001/PAY-002.
- No se permite saldo negativo salvo política explícita de sobrepago. Reembolsos y devoluciones conservan trazabilidad completa.
- PAY-004 deriva el total desde PricingSnapshot y el pagado desde Payments `RECORDED`; PaymentApplication solo distribuye el dinero entre cuotas. Sin plan, vencido es cero y próximo vencimiento es nulo. Con plan, una cuota queda vencida cuando conserva saldo y su fecha pura es anterior a la fecha local IANA del Business; el próximo vencimiento es la primera cuota fechada pendiente por fecha, orden e id, y expone su saldo restante.
- PAY-004 deriva `PAID`, `OVERDUE`, `PARTIALLY_PAID` y `UNPAID`, en ese orden de precedencia. No persiste balance ni estado, no bloquea por estado operativo cuando existe PricingSnapshot y falla ante datos financieros que violen la invariante del saldo.

### 7. Estados

#### Plan de pagos

- PAY-002 no persiste estado del plan; su ciclo de vida ampliado queda fuera de esta capacidad.

#### Pago previsto

- `PENDING`, `PARTIALLY_PAID`, `PAID` y `OVERDUE`, derivados de vencimiento, monto y aplicaciones. PAY-002 no persiste este estado.

#### Pago real

- `RECORDED` en PAY-001.
- Anulado y reembolsado son estados futuros, sujetos a sus contratos correspondientes.

#### Estado financiero derivado de Booking

- `UNPAID`, `PARTIALLY_PAID`, `PAID` y `OVERDUE` en PAY-004.
- Reembolsada y Con saldo a favor permanecen futuras.

### 8. Eventos

Los siguientes eventos son candidatos para capacidades futuras y no implican mensajería ni comportamiento ya implementado:

- `PaymentPlanCreated`, `PaymentPlanUpdated`, `PaymentRegistered`, `PaymentPartiallyApplied` y `PaymentFullyApplied`.
- `PaymentVoided`, `PaymentReceiptAttached`, `PaymentOverdue`, `BookingFinancialStatusChanged`, `RefundRegistered` y `OverpaymentDetected`.

Payment puede consumir `BookingCreated`, `BookingConfirmed`, `BookingCancelled`, `PricingSnapshotCreated`, `CheckInCompleted` y `CheckOutCompleted`.

No se asume una implementación técnica basada en mensajería o event bus.

### 9. Relaciones

- Payment pertenece a Business; el plan pertenece a Booking, que puede tener cero o un plan y múltiples pagos reales.
- Un plan contiene múltiples pagos previstos; un pago real puede aplicarse a uno o más previstos.
- Payment consulta el total acordado del Pricing Snapshot relacionado; Contact puede ser referencia del pagador, pero el pago pertenece a Booking.
- Files almacena comprobantes; Audit y Activity registran movimientos financieros.

PaymentApplication materializa la relación entre un Payment y una cuota del plan de la misma Booking y Business.

### 10. Capacidades

- Crear, consultar y reemplazar un plan antes de su primera aplicación.
- Registrar un pago real y aplicarlo automáticamente a una o varias cuotas.
- Leer Payment Plan con `payment.read` y registrar Payments o escribir el plan con `payment.record`, según la matriz IAM-008.
- Consultar saldo, vencidos y próximo vencimiento por Booking mediante PAY-004; consultar historial mediante PAY-003.
- Adjuntar comprobante, anular pagos y registrar reembolsos en capacidades futuras.

### 11. Restricciones

- No eliminar pagos ni información financiera histórica, ni permitir montos cero o negativos.
- No mezclar pagos reales con Pricing, almacenar datos sensibles de tarjetas, procesar pagos online, conciliación bancaria, contabilidad o facturación electrónica en el MVP.
- No recalcular el precio al registrar pagos ni modificar silenciosamente un pago registrado.
- No anular pagos sin motivo ni permitir operaciones entre Negocios distintos o saldo negativo salvo política de sobrepago.

### 12. Pendientes

- Plantillas iniciales de plan de pagos.
- Regla definitiva de confirmación automática tras primer pago.
- Política de sobrepago y saldo a favor.
- Tratamiento exacto de reembolsos.
- Formatos y límites de comprobantes.
- Política de vencimientos y pagos atrasados.
- Múltiples monedas.
- Política de redondeo.
- Tratamiento financiero de cancelaciones y No Show.
- Integración futura con pagos online.

## Block

### 1. Propósito

Representar un período durante el cual un Resource no puede reservarse por una razón operativa distinta de una Booking.

### 2. Responsabilidad

Block impide temporalmente la disponibilidad de un Resource y representa motivos operativos de mantenimiento, uso del propietario u otro motivo operativo.

Mantiene el rango temporal, permite crear, actualizar, cancelar y finalizar bloqueos, informa a Availability, conserva motivo, observaciones, responsable y auditoría, y evita reservas ficticias para bloquear fechas.

### 3. No Responsabilidad

Block no representa una Booking, administra clientes, calcula precios, registra pagos ni gestiona inventario.

No ejecuta mantenimiento, órdenes de trabajo, reparaciones o limpiezas; no modifica directamente una Booking ni sustituye el estado operativo permanente de Resource.

### 4. Conceptos principales

- Bloqueo, Resource bloqueado, intervalo temporal, tipo y motivo.
- Estado persistido, estado efectivo derivado, observación, inicio, finalización y cancelación.
- Conflicto de disponibilidad.

### 5. Información administrada

#### Identidad

- Id, Negocio, Resource, estado persistido, tipo, motivo y observación opcional.

#### Alcance

- Un Resource asociado, fecha y hora de inicio y fecha y hora de finalización. Los instantes se reciben como RFC3339 con offset explícito y se persisten como instantes.

#### Auditoría

- Fecha de creación y fecha de modificación.
- Fecha y motivo de cancelación cuando corresponda.

### 6. Reglas de negocio

- Todo Block pertenece exactamente a un Negocio y afecta exactamente un Resource que pertenece al mismo Negocio. Bloquear varios Resources requiere crear un Block por Resource.
- El tipo es `MAINTENANCE`, `OWNER_USE` u `OTHER`. El motivo es obligatorio, se normaliza con `trim` y su longitud final es de 2 a 120 caracteres. La observación es opcional, admite `null`, se normaliza con `trim` y no supera 500 caracteres.
- Inicio y fin son instantes RFC3339 con offset explícito y forman el intervalo semiabierto `[startsAt, endsAt)`, donde `endsAt` es estrictamente posterior a `startsAt`. No se implementan bloqueos de día completo ni recurrencia en el MVP.
- Un Block `SCHEDULED` antes de `startsAt` tiene estado efectivo `SCHEDULED`; desde `startsAt` inclusive hasta `endsAt` exclusivo tiene estado efectivo `ACTIVE`; desde `endsAt` inclusive tiene estado efectivo `COMPLETED`. Un Block `CANCELLED` siempre tiene estado efectivo `CANCELLED`.
- Un Block programado o efectivo activo impide reservas del período afectado; Cancelado no afecta Availability y Finalizado no afecta disponibilidad futura.
- Los bloqueos no se representan mediante reservas ficticias. Un Resource Fuera de servicio puede coexistir con Blocks históricos, pero su indisponibilidad permanente depende de Resource.
- Un Block debe conservarse históricamente sin eliminación física.
- La integración de conflictos con Bookings confirmadas o en curso es obligatoria cuando exista persistencia de Booking y antes del cierre de Availability o Booking. Este MVP de Block no crea una implementación sustitutiva ni asume silenciosamente la ausencia de conflictos.
- Block y mantenimiento son distintos: Block representa indisponibilidad; mantenimiento podrá ser una Extension futura. Block no modifica Pricing ni genera pagos o cargos.

### 7. Estados

- Estados persistidos: `SCHEDULED` y `CANCELLED`.

Estados efectivos derivados: `SCHEDULED`, `ACTIVE`, `COMPLETED` y `CANCELLED`, según el intervalo y la regla definida para `startsAt`, `endsAt` y `now`.

`SCHEDULED` y un Block efectivo `ACTIVE` pueden cancelarse. `CANCELLED` es idempotente y preserva su motivo y fecha de cancelación originales. `COMPLETED` no puede cancelarse. No se permite eliminación física como mecanismo normal.

### 8. Eventos

- `BlockCreated`, `BlockUpdated`, `BlockActivated`, `BlockCompleted`, `BlockCancelled`, `BlockResourcesChanged`, `BlockDatesChanged` y `BlockConflictDetected`.

Block puede reaccionar o validar respecto a `ResourceActivated`, `ResourceTakenOutOfService`, `ResourceArchived`, `BookingConfirmed`, `BookingDatesChanged`, `BookingResourceChanged` y `BookingCancelled`.

No se asume una implementación técnica basada en mensajería o event bus.

### 9. Relaciones

- Block pertenece a Business y se asocia a un único Resource.
- Availability consulta Block; Booking no crea Block automáticamente en el MVP.
- Resource conserva relación histórica con Blocks; Activity y Audit pueden registrar cambios.
- Una futura Extension de Maintenance puede crear o relacionarse con Block.

No se definen aún las cardinalidades técnicas de base de datos.

### 10. Capacidades

- Crear un Block para un Resource.
- Cancelar un Block.
- Listar el historial de Blocks del Negocio, opcionalmente por Resource o por intersección temporal.

### 11. Restricciones

- No crear Block sin Resource ni mezclar Resource y Negocio de distintos tenants.
- No permitir períodos inválidos, eliminación física de Blocks con historial, ocultar conflictos ni compartir Blocks entre Negocios.
- No utilizar Block para Booking, inventario, órdenes de trabajo o ejecución/costos de mantenimiento, ni incluir pagos.
- No permitir que Cancelado afecte Availability ni modificar silenciosamente reservas existentes.

### 12. Pendientes

- Bloqueo de múltiples Resources en una sola operación.
- Tratamiento de bloqueos recurrentes y de día completo.
- Tratamiento de zonas horarias.
- Alcance de integración futura con Maintenance y Cleaning.
- Visualización exacta en Calendario.

## Dashboard

### Contrato conjunto del MVP

Dashboard es una proyección read-only tenant-scoped y no persiste métricas, snapshots ni estados propios. DSH-002, DSH-003 y DSH-004 proveen proyecciones internas de Occupancy, Revenue y Reservations; DSH-001 las compone mediante el único endpoint público `GET /api/businesses/:businessId/dashboard`. La secuencia aprobada es DSH-002, DSH-003, DSH-004 y DSH-001.

### Contrato DSH-001 — Business Dashboard

DSH-001 recibe `from` y `to` obligatorios en formato de fecha, con período semiabierto `[from, to)` de hasta 31 días interpretado por cada proyección en la timezone IANA del Business. Devuelve exclusivamente `occupancy`, `revenue` y `reservations` con los contratos aprobados de DSH-002, DSH-003 y DSH-004; no recalcula métricas ni consulta directamente sus datos fuente.

La composición es all-or-nothing: una falla de entrada, Business ausente o invariante de cualquier KPI hace fallar el contrato completo. La lectura se permite para Business archivado con Membership válida y `dashboard.read`; esta capability BUSINESS corresponde a `OWNER`, `ADMIN`, `RECEPTIONIST` y `VIEWER`. DSH-001 no agrega persistencia, cache, infraestructura de datos, índices ni cambios Prisma.

### Contrato DSH-002 — Occupancy KPI

DSH-002 calcula la proporción de Resource-nights ocupadas respecto de Resource-nights vendibles durante un período obligatorio `[from, to)` de hasta 31 días, interpretado en la timezone IANA del Business. Usa exclusivamente el inventario operacional actual: solo Resources actualmente `ACTIVE` participan en numerador y denominador, incluso para períodos históricos. Una Resource comienza a aportar desde la fecha local de su `createdAt`; `OUT_OF_SERVICE` y `ARCHIVED` quedan fuera de ambos agregados.

El numerador cuenta unidades distintas `resourceId + localDate` cubiertas por Bookings `CONFIRMED`, `IN_PROGRESS` o `COMPLETED`; excluye `DRAFT`, `PENDING`, `CANCELLED` y `NO_SHOW`. Una Booking aporta una Resource-night por la única asociación de Resource permitida y por noche. El denominador contiene las noches potencialmente vendibles del inventario elegible y no se reduce por Bookings. Cada Resource-night intersectada por uno o más Blocks no cancelados se resta una sola vez del denominador y no se convierte en ocupación.

La proyección interna devuelve `occupiedResourceNights`, `sellableResourceNights` y `occupancyRateBasisPoints`. La tasa es `round(occupiedResourceNights * 10000 / sellableResourceNights)`; 10.000 representa 100% y un denominador cero produce `null`. Valores negativos o una ocupación superior al inventario vendible constituyen una invariante interna y no se corrigen mediante clamp.

Resource no conserva historial de cambios de estado. Por ello, Occupancy del MVP describe el período solicitado sobre el inventario operacional actual y no reconstruye qué Resources estaban `ACTIVE`, `OUT_OF_SERVICE` o `ARCHIVED` en cada fecha histórica. Esta limitación es contractual y no autoriza agregar ResourceStatusHistory dentro de DSH-002.

### Contrato DSH-003 — Revenue KPI

DSH-003 deriva `recorded payments revenue`: los cobros efectivamente registrados como Payments `RECORDED` durante un período obligatorio `[from, to)` de hasta 31 días. Los límites son fechas comerciales interpretadas en la timezone IANA del Business y filtran por `Payment.paidAt`, que representa el momento efectivo declarado del cobro. `Payment.createdAt` no define el período.

La proyección interna devuelve `currency` y `amountMinor`. Suma directamente `Payment.amountMinor` dentro del Business y no filtra por el estado actual de Booking. Un período sin Payments devuelve importe cero en la moneda vigente del Business. El MVP admite `PYG`; más de una moneda o una moneda distinta de la del Business, así como importes negativos o fuera del rango seguro entero, constituyen invariantes internas y no se corrigen ni convierten mediante FX.

Revenue no se calcula desde PricingSnapshot, PaymentPlan, PaymentApplications, Outstanding Balance ni Payment History. No representa contabilidad, revenue recognition, facturación, forecasting o revenue management. DSH-003 no persiste agregados, no usa cache y no expone endpoint propio; DSH-001 compone esta proyección en el contrato público del Dashboard.

### Contrato DSH-004 — Reservations KPI

DSH-004 cuenta las Bookings creadas dentro de un período obligatorio `[from, to)` de hasta 31 días, cuyos límites se interpretan en la timezone IANA del Business. La cohorte se determina exclusivamente por `Booking.createdAt`; `checkInDate`, `checkOutDate`, `updatedAt`, Timeline y las fechas de transición no alteran su pertenencia.

La proyección interna devuelve `total` y `byStatus`, incluyendo siempre `DRAFT`, `PENDING`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` y `NO_SHOW`, aunque su valor sea cero. Cada Booking cuenta una vez según su estado actual al consultar: no se reconstruye el estado histórico. Una Booking multi-resource sigue contando una sola reserva y Contact no afecta el agregado.

La consulta es tenant-scoped, permite lectura histórica de Business archivado y no expone endpoint propio. Counts negativos, decimales, fuera del entero seguro, estados desconocidos, filas duplicadas o una suma inconsistente constituyen invariantes internas. DSH-004 no persiste agregados ni usa cache; DSH-001 compone esta proyección en el contrato público del Dashboard protegido por `dashboard.read`.
