# TOP — Business Rules

## 1. Convenciones

Los identificadores usan el formato `BR-XXX`. Tipos: Integridad, Configurable, Automatización, Autorización y Restricción del MVP. Estados: Aprobada, Pendiente y Futura.

Cada regla indica ID, nombre, tipo, estado, dominios afectados, descripción, comportamiento esperado y excepciones cuando existan.

## 2. Aislamiento por Negocio

- **BR-001 — Pertenencia operativa.** Tipo: Integridad. Estado: Aprobada. Dominios: Todos. Descripción: todo dato operativo pertenece exactamente a un Negocio. Comportamiento: se conserva el contexto del Negocio. Excepciones: ninguna.
- **BR-002 — Aislamiento de entidades.** Tipo: Integridad. Estado: Aprobada. Dominios: Resource, Contact, Booking, Pricing, Payment, Block. Descripción: no se comparten entidades entre Negocios. Comportamiento: se rechaza acceso cruzado. Excepciones: ninguna.
- **BR-003 — Contexto de operación.** Tipo: Integridad. Estado: Aprobada. Dominios: Todos. Descripción: toda consulta y operación usa un único Negocio. Comportamiento: no hay resultados fuera del contexto. Excepciones: ninguna.
- **BR-004 — Usuario multi-Negocio.** Tipo: Autorización. Estado: Aprobada. Dominios: Business. Descripción: un usuario puede pertenecer a varios Negocios. Comportamiento: opera en uno por vez. Excepciones: ninguna.
- **BR-005 — Negocio inmutable.** Tipo: Integridad. Estado: Aprobada. Dominios: Todos. Descripción: no se cambia el Negocio de una entidad existente. Comportamiento: se conserva la pertenencia original. Excepciones: ninguna.

## 3. Resource

- **BR-006 — Pertenencia de Resource.** Tipo: Integridad. Estado: Aprobada. Dominios: Resource, Business. Descripción: todo Resource pertenece a un Negocio. Comportamiento: no se comparte. Excepciones: ninguna.
- **BR-007 — Unidad indivisible.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Resource, Booking. Descripción: Resource es indivisible. Comportamiento: no hay reserva parcial. Excepciones: ninguna.
- **BR-008 — Sin jerarquías.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Resource. Descripción: no existen jerarquías padre-hijo. Comportamiento: cada Resource es una unidad directa. Excepciones: ninguna.
- **BR-009 — Estados de ocupación.** Tipo: Integridad. Estado: Aprobada. Dominios: Resource, Availability. Descripción: disponible y ocupado no son estados de Resource. Comportamiento: Availability los calcula. Excepciones: ninguna.
- **BR-010 — Resource reservable.** Tipo: Integridad. Estado: Aprobada. Dominios: Resource, Availability, Booking. Descripción: solo Resources Activos pueden reservarse. Comportamiento: se excluyen los demás. Excepciones: ninguna.
- **BR-011 — Historial de Resource.** Tipo: Integridad. Estado: Aprobada. Dominios: Resource. Descripción: Resources con historial no se eliminan físicamente. Comportamiento: se archivan. Excepciones: ninguna.
- **BR-012 — Capacidad mínima.** Tipo: Integridad. Estado: Aprobada. Dominios: Resource. Descripción: capacidad máxima es al menos uno. Comportamiento: se rechaza un valor menor. Excepciones: ninguna.
- **BR-013 — Capacidad de huéspedes.** Tipo: Integridad. Estado: Aprobada. Dominios: Resource, Booking. Descripción: huéspedes no superan capacidad máxima. Comportamiento: se valida al reservar. Excepciones: autorización futura explícita.
- **BR-014 — Mantenimiento temporal.** Tipo: Integridad. Estado: Aprobada. Dominios: Resource, Block. Descripción: mantenimiento temporal se representa mediante Block. Comportamiento: no es estado permanente. Excepciones: ninguna.

## 4. Pricing

- **BR-015 — Precio fuera de Resource.** Tipo: Integridad. Estado: Aprobada. Dominios: Pricing, Resource. Descripción: el precio no se almacena en Resource. Comportamiento: se consulta Pricing. Excepciones: ninguna.
- **BR-016 — Independencia económica.** Tipo: Integridad. Estado: Aprobada. Dominios: Pricing, Payment. Descripción: Pricing, plan de pagos y pagos reales son independientes. Comportamiento: no se mezclan responsabilidades. Excepciones: ninguna.
- **BR-017 — Pertenencia tarifaria.** Tipo: Integridad. Estado: Aprobada. Dominios: Pricing, Business. Descripción: toda lista o regla pertenece a un Negocio. Comportamiento: se aísla por Negocio. Excepciones: ninguna.
- **BR-018 — Asignación tarifaria.** Tipo: Integridad. Estado: Aprobada. Dominios: Pricing, Resource. Descripción: una lista puede asignarse a varios Resources. Comportamiento: se consideran opciones aplicables. Excepciones: ninguna.
- **BR-019 — Selección de tarifa.** Tipo: Configurable. Estado: Aprobada. Dominios: Pricing, Booking. Descripción: se sugiere tarifa y el usuario puede elegir otra válida. Comportamiento: se conserva selección. Excepciones: ninguna.
- **BR-020 — Precio personalizado.** Tipo: Integridad. Estado: Aprobada. Dominios: Pricing. Descripción: requiere motivo. Comportamiento: se audita. Excepciones: ninguna.
- **BR-021 — Precio no negativo.** Tipo: Integridad. Estado: Aprobada. Dominios: Pricing. Descripción: no hay precios negativos. Comportamiento: se rechazan. Excepciones: ninguna.
- **BR-022 — Snapshot inmutable.** Tipo: Integridad. Estado: Aprobada. Dominios: Pricing, Booking. Descripción: Snapshot se congela al confirmar. Comportamiento: cambios posteriores no afectan confirmadas. Excepciones: ninguna.
- **BR-023 — Recálculo.** Tipo: Integridad. Estado: Aprobada. Dominios: Pricing, Booking. Descripción: cambio de fechas o Resource exige mantener o recalcular. Comportamiento: usuario decide y se audita. Excepciones: ninguna.
- **BR-024 — Promociones.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Pricing. Descripción: promociones son reglas de Pricing. Comportamiento: no crean dominio independiente. Excepciones: ninguna.

**Pendientes:** prioridad entre reglas, impuestos, redondeo, múltiples monedas, huésped adicional y feriados.

## 5. Availability

- **BR-025 — Disponibilidad calculada.** Tipo: Integridad. Estado: Aprobada. Dominios: Availability. Descripción: no es fuente persistente independiente. Comportamiento: se calcula. Excepciones: ninguna.
- **BR-026 — Bloqueo por Booking.** Tipo: Integridad. Estado: Aprobada. Dominios: Availability, Booking. Descripción: Borrador no bloquea; Pendiente, Confirmada y En curso bloquean; Cancelada, Finalizada y No Show no bloquean. Comportamiento: AVL-001 lo calcula por estado y por intersección semiabierta. Excepciones: ninguna.
- **BR-027 — Pendiente configurable.** Tipo: Configurable. Estado: Aprobada. Dominios: Availability, Booking. Descripción: en la política efectiva por defecto Pendiente bloquea. Comportamiento: AVL-003 implementa `pendingBlocksAvailability` por Negocio; su ausencia equivale a `true` y solo altera el bloqueo de `PENDING`, no los demás estados. Excepciones: ninguna.
- **BR-028 — Bloqueos y Resources.** Tipo: Integridad. Estado: Aprobada. Dominios: Availability, Block, Resource. Descripción: Block Programado/Activo bloquea; solo Resource Activo es elegible. Comportamiento: se excluye lo no reservable. Excepciones: ninguna.
- **BR-029 — Revalidación.** Tipo: Integridad. Estado: Aprobada. Dominios: Availability, Booking. Descripción: se revalida al confirmar. Comportamiento: no se permite doble reserva. Excepciones: overbooking habilitado.
- **BR-030 — Overbooking.** Tipo: Configurable. Estado: Aprobada. Dominios: Availability. Descripción: está deshabilitado por defecto. Comportamiento: solo se aplica si se habilita. Excepciones: ninguna.
- **BR-031 — Resultado explicable.** Tipo: Automatización. Estado: Aprobada. Dominios: Availability. Descripción: explica conflictos y ofrece alternativas cuando sea posible. Comportamiento: devuelve motivos y alternativas. Excepciones: ausencia de alternativas.
- **BR-032 — Mismo día.** Tipo: Integridad. Estado: Aprobada. Dominios: Availability, Booking. Descripción: entrada y salida pueden coexistir sin solapamiento horario. Comportamiento: se evalúan horarios. Excepciones: ninguna.
- **BR-032A — Semántica temporal inicial.** Tipo: Integridad. Estado: Aprobada. Dominios: Availability, Booking, Block. Descripción: Availability usa `[inicio, fin)` e intersección estricta `existing.start < requested.end AND existing.end > requested.start`. Comportamiento: extremos contiguos no entran en conflicto. Excepciones: ninguna.
- **BR-032B — Resultado inicial.** Tipo: Integridad. Estado: Aprobada. Dominios: Availability. Descripción: solo devuelve `AVAILABLE` o `UNAVAILABLE` con razones `RESOURCE_OUT_OF_SERVICE`, `RESOURCE_ARCHIVED`, `BOOKING_CONFLICT` y `BLOCK_CONFLICT`. Comportamiento: Resource no activo no está disponible; no hay alternativas ni auto-asignación. Excepciones: ninguna.
- **BR-032C — Política MVP.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Availability. Descripción: PENDING bloquea; buffers son cero y overbooking está deshabilitado. Comportamiento: DRAFT, FINISHED, CANCELLED y NO_SHOW no bloquean; configuración avanzada queda posterior. Excepciones: ninguna.
- **BR-032D — Calendario derivado.** Tipo: Integridad. Estado: Aprobada. Dominios: Availability, Resource, Booking, Block. Descripción: AVL-002 completada reutiliza la semántica de AVL-001 para una matriz Resource×día. Comportamiento: el rango `[from, to)` admite hasta 31 días; cada día representa `[date, date + 1 day)`, se ordena ascendentemente y se evalúa con la misma intersección estricta; los Resources se ordenan por `sortOrder ASC`, `name ASC`, `id ASC`, sin excluir `OUT_OF_SERVICE` ni `ARCHIVED`. Excepciones: ninguna.
- **BR-032E — Consulta eficiente de calendario.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Availability. Descripción: un calendario no persiste resultados ni consulta AVL-001 por cada Resource y día. Comportamiento: carga el scope de Resources y los conflictos de Booking y Block del rango completo para derivar la matriz determinísticamente. Excepciones: ninguna.
- **BR-032F — Reglas por Negocio.** Tipo: Configurable. Estado: Aprobada. Dominios: Availability, Business. Descripción: AVL-003 define una configuración única por Business con defaults compatibles. Comportamiento: si no existe registro, `pendingBlocksAvailability` es `true` y `bufferBeforeDays`/`bufferAfterDays` son `0`; AVL-001 y AVL-002 consumen la misma regla efectiva. Excepciones: ninguna.
- **BR-032G — Buffers de Availability.** Tipo: Configurable. Estado: Aprobada. Dominios: Availability, Booking. Descripción: los buffers son días enteros no negativos y expanden solo el intervalo de Booking `[checkInDate, checkOutDate)` a `[checkInDate - before, checkOutDate + after)` antes de la intersección. Comportamiento: no modifica la semántica semiabierta ni aplica a Block, que conserva `[startsAt, endsAt)` exactos. Excepciones: ninguna.

**Pendientes:** solapamiento exacto, No Show, buffers, concurrencia, orden de alternativas y adultos/menores.

## 6. Contact

- **BR-033 — Pertenencia de Contact.** Tipo: Integridad. Estado: Aprobada. Dominios: Contact, Business. Descripción: todo Contact pertenece a un Negocio. Comportamiento: no se comparte. Excepciones: ninguna.
- **BR-034 — Responsable de Booking.** Tipo: Integridad. Estado: Aprobada. Dominios: Contact, Booking. Descripción: Booking confirmada requiere Contact responsable. Comportamiento: se bloquea confirmación sin él. Excepciones: ninguna.
- **BR-035 — Contact mínimo.** Tipo: Integridad. Estado: Aprobada. Dominios: Contact. Descripción: requiere nombre y medio válido. Comportamiento: email es opcional con teléfono o WhatsApp. Excepciones: ninguna.
- **BR-036 — Huéspedes adicionales.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Contact, Booking. Descripción: no necesitan ser Contact. Comportamiento: se mantienen como huéspedes. Excepciones: ninguna.
- **BR-037 — Historial y duplicados.** Tipo: Integridad. Estado: Aprobada. Dominios: Contact. Descripción: no se eliminan Contacts históricos ni se fusionan duplicados automáticamente. Comportamiento: se conserva historial. Excepciones: ninguna.
- **BR-038 — Datos sensibles.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Contact, Payment. Descripción: no se almacenan datos bancarios ni credenciales de pago. Comportamiento: se rechazan. Excepciones: ninguna.

**Pendientes:** normalización de teléfonos, documentos, duplicados, privacidad/retención y contactos corporativos.

## 7. Booking

- **BR-039 — Pertenencia y borrador.** Tipo: Integridad. Estado: Aprobada. Dominios: Booking. Descripción: toda Booking pertenece a un Negocio y un `DRAFT` puede estar incompleto. Comportamiento: `BKG-001` crea `DRAFT` con body vacío permitido; Contact y Resources son opcionales en esta etapa, pero todo valor presente debe pertenecer al mismo Negocio. Excepciones: ninguna.
- **BR-040 — Confirmación válida.** Tipo: Integridad. Estado: Aprobada. Dominios: Booking, Contact, Resource, Availability, Pricing. Descripción: confirmar requiere Contact, fechas válidas, Resource, Availability revalidada y Snapshot. Comportamiento: se rechaza en ausencia de cualquiera. Excepciones: ninguna.
- **BR-041 — Estadía y pagos.** Tipo: Integridad. Estado: Aprobada. Dominios: Booking, Payment. Descripción: salida es posterior a entrada cuando ambas fechas existen; puede incluir varios Resources y existir sin pagos. Comportamiento: en `DRAFT`, las fechas `YYYY-MM-DD` pueden ser individuales; adultos y menores opcionales son enteros mayores o iguales a cero; `resourceIds` no admite duplicados y su reemplazo es atómico. Excepciones: ninguna.
- **BR-042 — Estados independientes.** Tipo: Integridad. Estado: Aprobada. Dominios: Booking, Payment. Descripción: estado operativo y financiero son independientes; check-in/out son eventos. Comportamiento: no se mezclan. Excepciones: ninguna.
- **BR-043 — Historial de Booking.** Tipo: Integridad. Estado: Aprobada. Dominios: Booking. Descripción: no se elimina; Cancelada conserva historial; No Show difiere de Cancelada; Finalizada es irreversible. Comportamiento: se preserva trazabilidad. Excepciones: ninguna.
- **BR-044 — Número y cambios.** Tipo: Integridad. Estado: Aprobada. Dominios: Booking. Descripción: número visible es único por Negocio y no se reutiliza; cambios se auditan. Comportamiento: `BKG-004` solo modifica `DRAFT` y no permite editar estado ni Negocio; Availability y precio no se consultan todavía. Fechas/Resource deberán revalidar Availability cuando se defina la confirmación. Excepciones: ninguna.
- **BR-045 — Transiciones válidas.** Tipo: Integridad. Estado: Aprobada. Dominios: Booking. Descripción: Borrador→Pendiente/Cancelada; Pendiente→Confirmada/Cancelada; Confirmada→En curso/Cancelada/No Show; En curso→Finalizada. Comportamiento: solo se permiten estas transiciones. Excepciones: ninguna.
- **BR-046 — Transiciones inválidas.** Tipo: Integridad. Estado: Aprobada. Dominios: Booking. Descripción: Finalizada no vuelve, Cancelada no confirma, No Show no entra en curso y En curso no vuelve a Pendiente. Comportamiento: se rechazan. Excepciones: ninguna.

**Pendientes:** información mínima Pendiente, confirmación tras pago, Pendiente en Availability, cancelaciones/penalizaciones, No Show, cambios en estadía, early/late check-in, múltiple Resources en confirmación, archivado y duplicación. La semántica temporal de Availability se definirá después de `BKG-001` a `BKG-004`; Availability consumirá Booking, Block y estado operativo de Resource. Confirm Booking deberá revalidar Availability y exigir Pricing Snapshot. La validación de conflicto Booking↔Block no está implementada todavía.

## 8. Payment

- **BR-047 — Plan y pagos opcionales.** Tipo: Integridad. Estado: Aprobada. Dominios: Payment, Booking. Descripción: Booking puede existir sin plan o pagos; plan tiene múltiples previstos. Comportamiento: no se exige cobro inicial. Excepciones: ninguna.
- **BR-048 — Aplicación de pagos.** Tipo: Integridad. Estado: Aprobada. Dominios: Payment. Descripción: previsto puede cubrirse con varios reales; real se aplica parcial o totalmente. Comportamiento: se calcula saldo. Excepciones: ninguna.
- **BR-049 — Integridad del pago.** Tipo: Integridad. Estado: Aprobada. Dominios: Payment. Descripción: pagos no se eliminan; incorrecto se anula con motivo; anulados no cuentan; monto es mayor que cero. Comportamiento: se conserva trazabilidad. Excepciones: ninguna.
- **BR-050 — Estado financiero.** Tipo: Integridad. Estado: Aprobada. Dominios: Payment, Pricing, Booking. Descripción: pago no cambia Snapshot ni confirma salvo regla; estado deriva de válidos. Comportamiento: no hay saldo negativo salvo sobrepago explícito. Excepciones: política futura.
- **BR-051 — Reembolsos y seguridad.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Payment. Descripción: reembolso es trazable; no se almacenan tarjetas sensibles. Comportamiento: se rechazan datos sensibles. Excepciones: ninguna.

**Pendientes:** sobrepagos, saldo a favor, reembolsos, métodos iniciales, comprobantes, vencimientos, distribución entre cuotas, monedas, cancelaciones y No Show.

## 9. Block

- **BR-052 — Alcance de Block.** Tipo: Integridad. Estado: Aprobada. Dominios: Block, Business, Resource. Descripción: pertenece a un Negocio y afecta exactamente un Resource del mismo. Comportamiento: se rechaza alcance cruzado; varios Resources requieren un Block por Resource. Excepciones: ninguna.
- **BR-053 — Período y bloqueo.** Tipo: Integridad. Estado: Aprobada. Dominios: Block, Availability. Descripción: `startsAt` y `endsAt` son RFC3339 con offset explícito, se persisten como instantes y forman `[startsAt, endsAt)`, con final estrictamente posterior al inicio. Comportamiento: `SCHEDULED` y el estado efectivo `ACTIVE` bloquean; `CANCELLED` no y `FINISHED` no bloquea futuro. Excepciones: ninguna.
- **BR-054 — Conflictos de Block.** Tipo: Integridad. Estado: Aprobada. Dominios: Block, Booking. Descripción: no usa reservas ficticias; la validación de conflicto con Booking confirmada o en curso se incorpora cuando exista persistencia de Booking y antes del cierre de Availability o Booking. Comportamiento: no se resuelven conflictos silenciosamente. Excepciones: ninguna.
- **BR-055 — Historial, estado y cancelación.** Tipo: Integridad. Estado: Aprobada. Dominios: Block. Descripción: Block es indisponibilidad, no mantenimiento; persiste como `SCHEDULED` o `CANCELLED`, mientras `ACTIVE` y `FINISHED` son estados efectivos derivados por tiempo. Comportamiento: no se elimina físicamente; cancelar requiere motivo de 2 a 500 caracteres; `CANCELLED` es idempotente y `FINISHED` devuelve conflicto. Excepciones: ninguna.

**Pendientes:** conflicto con Booking, múltiples Resources en una sola operación, recurrencia, día completo, buffers e integración Maintenance/Cleaning.

## 10. Auditoría e historial

- **BR-056 — Registro auditable.** Tipo: Integridad. Estado: Aprobada. Dominios: Todos. Descripción: modificación registra entidad, identificador, usuario, fecha/hora, valor anterior/nuevo y motivo. Comportamiento: se conserva auditoría. Excepciones: ninguna.
- **BR-057 — Cambios obligatorios.** Tipo: Integridad. Estado: Aprobada. Dominios: Booking, Pricing, Payment, Block. Descripción: se auditan fechas, Resource, Contact, precio, confirmaciones, cancelaciones, No Show, check-in/out, pagos, anulaciones, Blocks y estados. Comportamiento: registro obligatorio. Excepciones: ninguna.
- **BR-058 — Historial separado.** Tipo: Integridad. Estado: Aprobada. Dominios: Todos. Descripción: historial automático y comentarios manuales son distintos; no se elimina información histórica/financiera. Comportamiento: se conservan ambos. Excepciones: ninguna.

## 11. Autorización inicial

- **BR-059 — Propietario.** Tipo: Autorización. Estado: Aprobada. Dominios: Todos. Descripción: Propietario tiene acceso total al Negocio. Comportamiento: administra alcance completo. Excepciones: ninguna.
- **BR-060 — Administrador.** Tipo: Autorización. Estado: Aprobada. Dominios: Todos. Descripción: opera y configura, salvo propietario y suscripción. Comportamiento: se excluyen esas áreas. Excepciones: ninguna.
- **BR-061 — Recepcionista y Consulta.** Tipo: Autorización. Estado: Aprobada. Dominios: Contact, Booking, Payment, Availability. Descripción: Recepcionista opera esas áreas y check-in/out; Consulta solo lee. Comportamiento: permisos limitados. Excepciones: ninguna.

**Pendientes:** matriz exacta, Pricing, anulación de Payment, cancelación de Booking y usuarios.

## 12. Concurrencia e integridad

- **BR-062 — Confirmación atómica.** Tipo: Integridad. Estado: Aprobada. Dominios: Availability, Booking. Descripción: se revalida dentro de confirmación; no hay confirmaciones incompatibles simultáneas. Comportamiento: operación atómica. Excepciones: ninguna.
- **BR-063 — Control concurrente.** Tipo: Integridad. Estado: Aprobada. Dominios: Todos. Descripción: cambios detectan versión desactualizada; frontend no es suficiente. Comportamiento: reglas críticas se aplican en backend. Excepciones: ninguna.
- **BR-064 — Idempotencia financiera.** Tipo: Integridad. Estado: Aprobada. Dominios: Booking, Payment. Descripción: operaciones evitan duplicación accidental; solicitudes repetidas no crean duplicados cuando se implemente idempotencia. Comportamiento: prevenir repetición. Excepciones: implementación pendiente.

La implementación técnica queda **Pendiente** para Architecture.

## 13. Restricciones del MVP

- **BR-065 — Extensions excluidas.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Producto. Descripción: fuera del MVP están IA, WhatsApp automatizado, Marketplace, Channel Manager, Revenue Management, Inventario, Maintenance, Cleaning y CRM avanzado. Comportamiento: no se implementan. Excepciones: ninguna.
- **BR-066 — Operación excluida.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Producto. Descripción: fuera del MVP están Contabilidad, Facturación electrónica, pagos online, conciliación bancaria y múltiples sucursales. Comportamiento: no se implementan. Excepciones: ninguna.
- **BR-067 — Resource excluido.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Resource, Booking. Descripción: no hay reserva parcial ni jerarquías de Resource. Comportamiento: se rechazan. Excepciones: ninguna.

## 14. Decisiones pendientes priorizadas

### Bloqueantes para Architecture

- Solapamiento temporal, concurrencia al confirmar, múltiples Resources, numeración de Booking, zona horaria, almacenamiento monetario/redondeo y matriz inicial de autorización.

### Bloqueantes para MVP funcional

- Booking Pendiente, confirmación tras pago, campos mínimos de Contact, métodos iniciales de Payment, tipos de Block, cancelación y No Show.

### No bloqueantes o futuras

- Los demás pendientes de Pricing, Availability, Contact, Booking, Payment y Block, sin duplicación.

## 15. Identity & Access

- **BR-068 — Identidad global.** Tipo: Integridad. Estado: Aprobada. Dominios: Identity & Access, Business. Descripción: User es una identidad global y puede pertenecer a varios Businesses. Comportamiento: las operaciones operativas requieren un `businessId` autorizado por membresía. Excepciones: ninguna.
- **BR-069 — Email normalizado y único.** Tipo: Integridad. Estado: Aprobada. Dominios: Identity & Access. Descripción: el email se normaliza con `trim` y minúsculas completas, se valida su formato y es único globalmente en su valor normalizado. Comportamiento: no se eliminan puntos ni alias `+` específicos de proveedores; un duplicado se rechaza. Excepciones: ninguna.
- **BR-070 — Credencial local protegida.** Tipo: Integridad. Estado: Aprobada. Dominios: Identity & Access. Descripción: LocalCredential tiene relación uno a uno con User y solo conserva `passwordHash`. Comportamiento: la contraseña nunca se persiste ni registra en texto plano. Excepciones: ninguna.
- **BR-071 — Política inicial de contraseña.** Tipo: Integridad. Estado: Aprobada. Dominios: Identity & Access. Descripción: una contraseña válida tiene entre 12 y 128 caracteres; permite espacios y caracteres Unicode. Comportamiento: no se trunca ni exige composición arbitraria; se almacena mediante Argon2id. Excepciones: ninguna.
- **BR-072 — Creación administrativa de User.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Identity & Access. Descripción: IAM-004 es aprovisionamiento administrativo sin registro público. Comportamiento: la primera implementación se ejecuta mediante script o seed administrativo controlado, sin Login previo. Excepciones: ninguna.
- **BR-073 — Creación atómica de identidad.** Tipo: Integridad. Estado: Aprobada. Dominios: Identity & Access. Descripción: crear User crea User `ACTIVE` y LocalCredential en una única operación. Comportamiento: si falla la credencial, se revierte el User. Excepciones: ninguna.
- **BR-074 — Membresía única.** Tipo: Integridad. Estado: Aprobada. Dominios: Identity & Access, Business. Descripción: solo puede existir una UserBusinessMembership por combinación de User y Business. Comportamiento: una membresía duplicada se rechaza. Excepciones: ninguna.
- **BR-075 — Integridad de membresía.** Tipo: Integridad. Estado: Aprobada. Dominios: Identity & Access, Business. Descripción: una membresía requiere User y Business existentes, y un rol obligatorio aprobado. Comportamiento: IAM-009 valida referencias y acepta únicamente `OWNER`, `ADMIN`, `RECEPTIONIST` o `VIEWER`. Excepciones: ninguna.
- **BR-076 — Separación de capacidades IAM.** Tipo: Restricción del MVP. Estado: Aprobada. Dominios: Identity & Access. Descripción: IAM-004 e IAM-009 son capacidades separadas de Login, Roles y Permissions. Comportamiento: crear User no crea membresía; gestionar membresía no crea User, credenciales, tokens ni permisos adicionales. Excepciones: ninguna.
- **BR-077 — Datos sensibles de identidad.** Tipo: Integridad. Estado: Aprobada. Dominios: Identity & Access. Descripción: las respuestas de creación de User no exponen contraseña, passwordHash ni tokens. Comportamiento: solo se devuelven los campos públicos aprobados. Excepciones: ninguna.

**Pendientes:** verificación contra contraseñas comprometidas, transiciones de User, estado individual de membresía, matriz detallada de permisos y mecanismo administrativo que protegerá `POST /api/users` cuando se habilite como endpoint.
