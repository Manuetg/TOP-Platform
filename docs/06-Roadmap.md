# TOP — Roadmap

## Propósito

Este documento registra la secuencia de evolución del MVP y las iniciativas futuras aprobadas. El backlog operativo y el estado de las capacidades se mantienen en [07-Backlog.md](07-Backlog.md).

## Estado actual

El backlog de implementación del Backend MVP está completado: 53 de 53 capacidades (100%). Dashboard completó sus 4 capacidades: DSH-002 — Occupancy KPI, DSH-003 — Revenue KPI, DSH-004 — Reservations KPI y DSH-001 — Business Dashboard como agregador público final. No quedan capacidades backend planificadas dentro del backlog MVP aprobado. El estado operativo vigente se encuentra en [07-Backlog.md](07-Backlog.md); este cierre no implica que frontend o el quality gate preproducción estén completados.

## Áreas funcionales del producto

El MVP mantiene las ocho áreas aprobadas en Vision y Product Strategy: Negocio, Recursos, Precios, Disponibilidad, Reservas, Pagos, Calendario y Dashboard. Identity & Access, Contact y Block son dominios backend de soporte y no representan áreas comerciales adicionales.

Calendario es un área funcional visible. Su capacidad backend inicial está cubierta por AVL-002 — Availability Calendar y no requiere una épica backend `Calendar` separada. Cualquier ampliación futura deberá incorporarse al Backlog mediante aprobación explícita.

## Secuencia histórica de dominios y capacidades backend

La siguiente secuencia conserva la referencia usada para estructurar el backlog backend; no representa las áreas funcionales visibles, el estado ni el orden operativo actual:

1. Business.
2. Identity & Access.
3. Resource.
4. Pricing.
5. Availability.
6. Contact.
7. Booking.
8. Payment.
9. Block.
10. Dashboard.

No se establecen fechas ni alcance adicional en este documento. Las ideas futuras deben registrarse aquí solo cuando cuenten con aprobación explícita.

## Propuestas para evaluar después de FE-DSH-001

Por solicitud del usuario, se conservan como propuestas pendientes de discovery los módulos de la referencia visual que no forman parte del contrato Dashboard actual: próximos check-ins, resumen de llegadas/salidas del día, actividad reciente, próximos pasos y comparaciones con períodos anteriores. No se implementan con datos ficticios ni implican una nueva capacidad backend aprobada. Antes de implementarlos se deben definir semántica, fuente, endpoint, autorización y alcance; no se presupone que otros listados resuelvan esos agregados.

Los previews de Recursos y Precios también quedan fuera de este slice: existen contratos de listado, pero su incorporación al Home requiere definir qué resumen aporta valor y cuánto dato cargar. FE-DSH-001 consume únicamente el Dashboard agregado. Estas propuestas no alteran el total backend de 53 ni el estado de FE-FND-006.
