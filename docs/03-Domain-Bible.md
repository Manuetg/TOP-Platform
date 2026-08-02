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

### 3. No Responsabilidad

Identity & Access no:

- administra datos operativos de un Negocio;
- selecciona silenciosamente un Negocio activo durante el login;
- almacena contraseñas en texto plano;
- implementa registro público en el MVP;
- administra sesiones, refresh tokens ni revocación como parte del modelo inicial.

### 4. Conceptos principales

- **User:** identidad global de una persona que puede acceder a TOP.
- **LocalCredential:** credencial local asociada a un User para autenticación propia.
- **UserBusinessMembership:** pertenencia de un User a un Business con un rol.
- **Rol:** nivel inicial de autorización de una membresía: `OWNER`, `ADMIN`, `RECEPTIONIST` o `VIEWER`.
- **Contexto de Negocio:** Business dentro del cual se autoriza una operación.

### 5. Información administrada

#### User

- Id UUID.
- Email normalizado y único.
- Estado: `ACTIVE` o `DISABLED`.
- Fecha de creación.
- Fecha de modificación.

#### LocalCredential

- User asociado.
- Hash de contraseña.
- Fecha de creación.
- Fecha de modificación.

La contraseña no se almacena en texto plano.

#### UserBusinessMembership

- Id UUID.
- User asociado.
- Business asociado.
- Rol.
- Fecha de creación.
- Fecha de modificación.

No se agrega un estado de membresía al modelo mínimo: el estado `DISABLED` del User impide su acceso. La desactivación individual de una membresía queda pendiente de definición.

### 6. Reglas de negocio

- User es una identidad global y puede pertenecer a varios Businesses.
- Un email normalizado corresponde a un único User.
- Una LocalCredential pertenece a un único User y solo almacena su hash de contraseña.
- Una combinación de User y Business solo puede tener una membresía.
- Toda membresía debe referenciar un Business existente.
- Las membresías determinan el rol del User dentro de cada Business.
- Toda operación operativa debe ejecutarse dentro de un `businessId` autorizado para el User.
- Login devuelve las membresías disponibles y no selecciona automáticamente un Business activo.
- La autorización se valida siempre en backend.

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
- Los módulos operativos consumen el contexto autorizado de Business, sin acceder a credenciales.

No se definen aún cardinalidades técnicas de base de datos ni relaciones con sesiones o refresh tokens.

### 10. Capacidades

- Crear User.
- Iniciar sesión.
- Actualizar User.
- Deshabilitar User.
- Gestionar roles y permisos según el backlog.

La capacidad explícita para asociar User con Business y rol está **Pendiente de definición** en el backlog.

### 11. Restricciones

- No compartir datos operativos entre Businesses.
- No permitir registro público en el MVP.
- No almacenar contraseñas, hashes o tokens en logs.
- No seleccionar un contexto de Business sin una acción o autorización explícita posterior.
- No incorporar Session ni RefreshToken al modelo inicial.

### 12. Pendientes

- Regla exacta de normalización del email.
- Política de contraseña.
- Transiciones de estado de User.
- Gestión individual del estado de una membresía.
- Capacidad y contrato para asociar User con Business y rol.
- Matriz detallada de permisos por rol.
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
- Reglas exactas de autorización.
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
- Siempre debe existir una opción de precio personalizado cuando el Negocio la tenga habilitada.
- Todo precio personalizado requiere motivo.
- El precio acordado debe congelarse al confirmar la reserva.
- Los cambios posteriores en listas o reglas no modifican reservas confirmadas.
- Un cambio de fechas o Resource puede requerir recalcular el precio.
- El usuario puede mantener el precio anterior o aceptar el nuevo cálculo, dejando auditoría.
- El precio debe mostrar un desglose comprensible por noche o concepto.
- La moneda debe ser válida para el Negocio.
- No se eliminan físicamente listas o reglas utilizadas históricamente.
- Pricing y plan de pagos son conceptos independientes.
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
- El plan de pagos es independiente del precio acordado.

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

### 12. Pendientes

- Jerarquía exacta cuando coinciden varias reglas.
- Catálogo inicial de tipos de regla.
- Tratamiento de impuestos.
- Política de redondeo monetario.
- Reglas exactas de autorización.
- Alcance preciso de promociones dentro del MVP.
- Soporte de múltiples monedas.
- Forma exacta de asignación entre planes y Resources.
- Tratamiento de precios por huésped adicional.
- Tratamiento de feriados y fechas especiales.

## Availability

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
- Reglas de capacidad para adultos y menores.
- Rendimiento objetivo y estrategia de caché.
- Reglas exactas de autorización.
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
- Reglas exactas de autorización.
- Política de retención y privacidad de datos personales.
- Información exacta de huéspedes adicionales.
- Posibilidad futura de contactos corporativos o empresas.

## Booking

### 1. Propósito

Representar y administrar el acuerdo comercial y operativo mediante el cual un Contact reserva uno o más Resources de un Negocio durante un período determinado, bajo condiciones económicas específicas.

### 2. Responsabilidad

Booking es responsable de mantener la identidad de la reserva, relacionarla con un Negocio, Contact responsable y uno o más Resources, administrar fechas y estado operativo, y coordinar confirmación, cancelación, check-in, check-out y finalización.

También referencia el Pricing Snapshot acordado, se relaciona con plan de pagos y pagos recibidos, mantiene huéspedes adicionales y observaciones operativas, conserva historial y auditoría, bloquea disponibilidad según estado y configuración del Negocio, y genera un número visible secuencial dentro del Negocio.

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

- Id interno, Número visible secuencial por Negocio, Negocio, Estado operativo.
- Fecha de creación, Fecha de modificación, Usuario creador, Usuario modificador.

#### Estadía

- Fecha de entrada, Fecha de salida, Hora de check-in prevista opcional, Hora de check-out prevista opcional.
- Cantidad de adultos, Cantidad de menores, Cantidad total de huéspedes y lista opcional de huéspedes adicionales.

#### Relaciones

- Contact responsable, uno o más Resources, Pricing Snapshot, plan de pagos y pagos relacionados.
- Archivos adjuntos, comentarios, actividad y auditoría.

#### Información operativa

- Origen de la reserva, observaciones, motivo de cancelación o No Show cuando corresponda.
- Fecha y hora real de check-in y check-out, y usuarios que los realizaron.

#### Información económica referenciada

- Precio acordado, Moneda, Total de la reserva, Estado financiero derivado y Saldo pendiente derivado.

Booking referencia esta información, pero Pricing y Payment conservan sus responsabilidades propias.

### 6. Reglas de negocio

- Toda Booking pertenece exactamente a un Negocio y debe tener un Contact responsable y al menos un Resource antes de confirmarse.
- En el MVP, los Resources reservados son unidades indivisibles; una Booking puede contener más de un Resource.
- La fecha de salida debe ser posterior a la fecha de entrada.
- Un borrador puede existir con información incompleta; una reserva pendiente debe contener la información mínima para ser evaluada.
- Una reserva confirmada debe tener Contact, fechas válidas, Resource disponible y Pricing Snapshot; Availability debe revalidarse inmediatamente antes de confirmar.
- Confirmada y En curso bloquean disponibilidad; Cancelada y Finalizada no bloquean disponibilidad futura; Pendiente puede bloquear según configuración y Borrador nunca bloquea.
- El precio se congela mediante Pricing Snapshot al confirmar. Cambiar fechas o Resource requiere revisar disponibilidad y puede requerir recálculo; el usuario debe mantener el precio anterior o aceptar el nuevo, dejando auditoría.
- Toda modificación relevante debe generar auditoría. Booking y Payment son independientes; una reserva puede existir sin pagos o tener múltiples pagos; el estado financiero no se mezcla con el operativo.
- Ninguna Booking se elimina físicamente y una cancelada conserva su historial.
- Check-in y check-out son eventos, no estados; No Show es distinto de Cancelada; Finalizada es irreversible en el MVP.
- Los huéspedes adicionales no necesitan ser Contacts. El número visible es único dentro del Negocio.

### 7. Estados

Estados operativos: Borrador, Pendiente, Confirmada, En curso, Finalizada, Cancelada y No Show.

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

- Booking pertenece a Business y referencia un Contact responsable.
- Puede asociarse a uno o más Resource; depende de Availability y solicita cálculos a Pricing.
- Conserva un Pricing Snapshot, puede tener plan de pagos y múltiples Payment, huéspedes adicionales, Activity, Comments, Files y Audit.
- No comparte información entre Negocios.

No se definen aún las cardinalidades técnicas de base de datos.

### 10. Capacidades

- Crear borrador o reserva; actualizar, consultar, buscar, confirmar, cancelar y marcar No Show.
- Cambiar fechas, Resource o Contact responsable; modificar huéspedes; aplicar o cambiar Pricing Snapshot según reglas.
- Asociar plan de pagos, registrar observaciones, adjuntar archivos, hacer check-in, check-out y finalizar.
- Consultar historial, duplicar una reserva como base para otra y consultar por fecha, Contact, Resource, estado o número visible.

### 11. Restricciones

- No confirmar sin revalidar Availability, Contact responsable, al menos un Resource, fechas válidas y Pricing Snapshot.
- No modificar silenciosamente el precio confirmado, eliminar físicamente una reserva ni mezclar estado operativo y financiero.
- No permitir doble reserva salvo política explícita de overbooking, ni usar check-in/check-out como estados persistentes independientes.
- No crear huéspedes como Contacts automáticamente, ni incluir CRM de consultas, notificaciones, WhatsApp, marketplace, inventario, limpieza o mantenimiento dentro de Booking.
- No permitir cambios de Negocio ni reutilizar números visibles de reservas canceladas o archivadas.

### 12. Pendientes

- Información mínima exacta para pasar de Borrador a Pendiente.
- Regla definitiva para confirmar automáticamente tras un primer pago.
- Comportamiento definitivo de reservas Pendientes sobre Availability.
- Política de cancelación y penalizaciones.
- Tratamiento de reembolsos.
- Regla exacta de No Show y liberación de disponibilidad.
- Reglas de modificación de reservas en curso.
- Tratamiento de early check-in y late check-out.
- Regla exacta para reservas con múltiples Resources.
- Numeración inicial y formato visible.
- Reglas exactas de autorización por rol.
- Validaciones de adultos, menores y capacidad.
- Campos obligatorios de huéspedes adicionales.
- Tratamiento de zonas horarias.
- Política de archivado.
- Alcance de duplicar reserva en el MVP.

## Payment

### 1. Propósito

Administrar los acuerdos de cobro y los pagos reales asociados a una Booking, permitiendo adelantos, cuotas, pagos parciales, comprobantes, anulaciones y consulta de saldo.

### 2. Responsabilidad

Payment administra el plan de pagos acordado, adelantos o cuotas flexibles y pagos reales recibidos, incluidos pagos parciales y su aplicación a obligaciones previstas.

Calcula importes pagados, pendientes y vencidos; mantiene el estado financiero derivado; registra método, fecha, referencia y comprobante; permite anular pagos sin eliminar historial y conserva auditoría completa, separando planes de pagos y transacciones reales.

### 3. No Responsabilidad

Payment no calcula precios ni administra tarifas o Pricing Snapshot, disponibilidad, confirmación o cancelación de reservas.

No emite facturación electrónica, administra contabilidad general, realiza conciliación bancaria automática ni procesa pagos online en el MVP; tampoco almacena credenciales bancarias ni datos sensibles de tarjetas.

### 4. Conceptos principales

- Plan de pagos, Pago previsto, Adelanto, Cuota, Saldo y Vencimiento.
- Pago real, Transacción, Pago parcial, Método de pago y Comprobante.
- Anulación, Reembolso, Estado financiero derivado, Monto aplicado y Monto pendiente.

### 5. Información administrada

#### Plan de pagos

- Id, Negocio, Booking, Tipo de plan, Estado, Total acordado y Moneda.
- Fecha de creación, Fecha de modificación, Usuario creador y Usuario modificador.

#### Pago previsto

- Id, Concepto, Monto, Porcentaje opcional, Fecha de vencimiento opcional, Estado, Orden y Observaciones.

#### Pago real

- Id, Negocio, Booking, Fecha y hora, Monto, Moneda, Método de pago, Referencia opcional y Observaciones.
- Comprobante opcional, Usuario que registró el pago, Estado, Fecha de creación, Fecha de anulación opcional, Usuario que anuló opcional y Motivo de anulación opcional.

#### Aplicación de pago

- Pago real, Pago previsto relacionado y Monto aplicado.

#### Información derivada

- Total pagado, Total pendiente, Total vencido, Estado financiero y Próximo vencimiento.

La información derivada puede calcularse y no debe necesariamente persistirse como fuente de verdad.

### 6. Reglas de negocio

- Todo plan de pagos pertenece exactamente a una Booking y a un Negocio. Una Booking puede existir sin plan de pagos o pagos reales; el plan es independiente del Pricing Snapshot.
- Un plan puede contener uno o múltiples pagos previstos; importes y vencimientos se definen libremente. Puede usarse una plantilla o crearse uno personalizado.
- Un pago real puede cubrir total o parcialmente un pago previsto; uno previsto puede cubrirse mediante varios reales y un real puede distribuirse entre varios previstos si las reglas lo permiten.
- Ningún pago real se elimina físicamente: uno incorrecto debe anularse con motivo y auditoría.
- El estado financiero se calcula desde pagos reales válidos. Registrar un pago no cambia el precio ni confirma una Booking, salvo regla explícita del Negocio.
- Pagos anulados no cuentan para el saldo; su monto debe ser mayor que cero y la moneda válida para Negocio y compatible con Booking.
- Comprobantes son opcionales salvo configuración contraria. Cambios en plantillas no modifican planes asociados; planes confirmados conservan historial.
- No se permite saldo negativo salvo política explícita de sobrepago. Reembolsos y devoluciones conservan trazabilidad completa.

### 7. Estados

#### Plan de pagos

- Borrador, Activo, Completado y Cancelado.

#### Pago previsto

- Pendiente, Pagado parcialmente, Pagado, Vencido y Cancelado.

#### Pago real

- Registrado, Anulado y Reembolsado (futuro).

#### Estado financiero derivado de Booking

- Sin pagos, Pago parcial, Pagada, Reembolsada y Con saldo a favor (futuro).

### 8. Eventos

- `PaymentPlanCreated`, `PaymentPlanUpdated`, `PaymentPlanActivated`, `PaymentScheduleItemCreated` y `PaymentScheduleItemUpdated`.
- `PaymentRegistered`, `PaymentPartiallyApplied`, `PaymentFullyApplied`, `PaymentVoided`, `PaymentReceiptAttached`, `PaymentOverdue`, `BookingFinancialStatusChanged`, `RefundRegistered` y `OverpaymentDetected`.

Payment puede consumir `BookingCreated`, `BookingConfirmed`, `BookingCancelled`, `PricingSnapshotCreated`, `CheckInCompleted` y `CheckOutCompleted`.

No se asume una implementación técnica basada en mensajería o event bus.

### 9. Relaciones

- Payment pertenece a Business; el plan pertenece a Booking, que puede tener un plan y múltiples pagos reales.
- Un plan contiene múltiples pagos previstos; un pago real puede aplicarse a uno o más previstos.
- Payment consulta el total acordado del Pricing Snapshot relacionado; Contact puede ser referencia del pagador, pero el pago pertenece a Booking.
- Files almacena comprobantes; Audit y Activity registran movimientos financieros.

No se definen aún las cardinalidades técnicas de base de datos.

### 10. Capacidades

- Crear, actualizar, cancelar o aplicar plantilla a un plan de pagos; crear plan sin cuotas, con adelanto y saldo o personalizado.
- Agregar o actualizar pago previsto; registrar pago real o parcial y aplicarlo a una o varias cuotas.
- Consultar saldo, vencidos, estado, historial y próximos vencimientos; adjuntar comprobante y anular pago.
- Registrar reembolso (futuro).

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
- Métodos de pago iniciales.
- Formatos y límites de comprobantes.
- Política de vencimientos y pagos atrasados.
- Distribución de un pago entre varias cuotas.
- Múltiples monedas.
- Política de redondeo.
- Reglas exactas de autorización.
- Edición de planes después de confirmar la reserva.
- Tratamiento financiero de cancelaciones y No Show.
- Integración futura con pagos online.

## Block

### 1. Propósito

Representar un período durante el cual uno o más Resources no pueden reservarse por una razón operativa distinta de una Booking.

### 2. Responsabilidad

Block impide temporalmente la disponibilidad de uno o más Resources y representa motivos operativos como mantenimiento, uso interno o bloqueo administrativo.

Mantiene el rango temporal, permite crear, actualizar, cancelar y finalizar bloqueos, informa a Availability, conserva motivo, observaciones, responsable y auditoría, y evita reservas ficticias para bloquear fechas.

### 3. No Responsabilidad

Block no representa una Booking, administra clientes, calcula precios, registra pagos ni gestiona inventario.

No ejecuta mantenimiento, órdenes de trabajo, reparaciones o limpiezas; no modifica directamente una Booking ni sustituye el estado operativo permanente de Resource.

### 4. Conceptos principales

- Bloqueo, Resource bloqueado, Rango temporal, Tipo de bloqueo y Motivo.
- Estado, Observación, Responsable, Inicio, Finalización y Cancelación.
- Conflicto de disponibilidad.

### 5. Información administrada

#### Identidad

- Id, Negocio, Estado, Tipo, Motivo y Descripción u observación opcional.

#### Alcance

- Uno o más Resources asociados, Fecha y hora de inicio, Fecha y hora de finalización e indicación de día completo cuando corresponda.

#### Auditoría

- Usuario creador, Fecha de creación, Usuario modificador y Fecha de modificación.
- Usuario, fecha y motivo de cancelación cuando corresponda.

### 6. Reglas de negocio

- Todo Block pertenece exactamente a un Negocio, debe asociarse al menos a un Resource y cada Resource asociado pertenece al mismo Negocio.
- La finalización debe ser posterior al inicio. Un Block activo o programado impide reservas del período afectado; Cancelado no afecta Availability y Finalizado no afecta disponibilidad futura.
- Los bloqueos no se representan mediante reservas ficticias. Un Resource Fuera de servicio puede coexistir con Blocks históricos, pero su indisponibilidad permanente depende de Resource.
- Un Block puede aplicarse a uno o varios Resources y debe conservarse históricamente sin eliminación física si afectó la operación.
- Crear o modificar Block valida conflictos con Bookings confirmadas o en curso; debe advertir superposiciones y nunca resolverlas silenciosamente.
- Block y mantenimiento son distintos: Block representa indisponibilidad; mantenimiento podrá ser una Extension futura. Block no modifica Pricing ni genera pagos o cargos.

### 7. Estados

- Programado, Activo, Finalizado y Cancelado.

Transiciones: Programado → Activo o Cancelado; Activo → Finalizado o Cancelado únicamente si la operación lo permite.

No se permite Finalizado → Activo, Cancelado → Activo ni eliminación física como mecanismo normal.

El paso de Programado a Activo y de Activo a Finalizado puede derivarse automáticamente según el tiempo, sin requerir modificación persistente inmediata, según la arquitectura elegida.

### 8. Eventos

- `BlockCreated`, `BlockUpdated`, `BlockActivated`, `BlockCompleted`, `BlockCancelled`, `BlockResourcesChanged`, `BlockDatesChanged` y `BlockConflictDetected`.

Block puede reaccionar o validar respecto a `ResourceActivated`, `ResourceTakenOutOfService`, `ResourceArchived`, `BookingConfirmed`, `BookingDatesChanged`, `BookingResourceChanged` y `BookingCancelled`.

No se asume una implementación técnica basada en mensajería o event bus.

### 9. Relaciones

- Block pertenece a Business y se asocia a uno o más Resource.
- Availability consulta Block; Booking no crea Block automáticamente en el MVP.
- Resource conserva relación histórica con Blocks; Activity y Audit pueden registrar cambios.
- Una futura Extension de Maintenance puede crear o relacionarse con Block.

No se definen aún las cardinalidades técnicas de base de datos.

### 10. Capacidades

- Crear, actualizar, consultar, cancelar y finalizar Block.
- Buscar por Resource, fecha, tipo o estado; asociar Resources; cambiar fechas, motivo u observaciones.
- Consultar conflictos con Bookings e historial, y mostrar Blocks en calendario.

### 11. Restricciones

- No crear Block sin Resource ni mezclar Resources de distintos Negocios.
- No permitir períodos inválidos, eliminación física de Blocks con historial, ocultar conflictos ni compartir Blocks entre Negocios.
- No utilizar Block para Booking, inventario, órdenes de trabajo o ejecución/costos de mantenimiento, ni incluir pagos.
- No permitir que Cancelado afecte Availability ni modificar silenciosamente reservas existentes.

### 12. Pendientes

- Catálogo inicial de tipos de Block.
- Regla exacta ante conflicto con Booking existente.
- Posibilidad de bloquear múltiples Resources en una sola operación dentro del MVP.
- Tratamiento de bloqueos recurrentes.
- Buffers automáticos antes o después de una Booking.
- Regla exacta para activar y finalizar Blocks según el tiempo.
- Reglas exactas de autorización.
- Tratamiento de zonas horarias.
- Alcance de integración futura con Maintenance y Cleaning.
- Visualización exacta en Calendario.
