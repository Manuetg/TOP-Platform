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

## Contact

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
