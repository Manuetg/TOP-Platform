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

### 2. Responsabilidad

### 3. No Responsabilidad

### 4. Conceptos principales

### 5. Información administrada

### 6. Reglas de negocio

### 7. Estados

### 8. Eventos

### 9. Relaciones

### 10. Capacidades

### 11. Restricciones

### 12. Pendientes

## Payment

### 1. Propósito

### 2. Responsabilidad

### 3. No Responsabilidad

### 4. Conceptos principales

### 5. Información administrada

### 6. Reglas de negocio

### 7. Estados

### 8. Eventos

### 9. Relaciones

### 10. Capacidades

### 11. Restricciones

### 12. Pendientes

## Block

### 1. Propósito

### 2. Responsabilidad

### 3. No Responsabilidad

### 4. Conceptos principales

### 5. Información administrada

### 6. Reglas de negocio

### 7. Estados

### 8. Eventos

### 9. Relaciones

### 10. Capacidades

### 11. Restricciones

### 12. Pendientes
