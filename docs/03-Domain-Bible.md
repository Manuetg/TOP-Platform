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

## Pricing

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
