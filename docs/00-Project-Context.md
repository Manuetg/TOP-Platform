# TOP — Contexto del proyecto

## Propósito

Este documento es el punto de entrada para cualquier persona o agente de IA que se incorpore a TOP. Resume el estado vigente sin reemplazar las fuentes de verdad detalladas.

## Visión y misión

TOP aspira a ser una plataforma SaaS para operar pequeños establecimientos turísticos, inicialmente en Paraguay y posteriormente en Latinoamérica.

Su misión es facilitar esa operación con una plataforma simple, moderna e inteligente, reduciendo trabajo manual y brindando control, tranquilidad y tiempo.

Ver [Visión](01-Vision.md) y [Estrategia de producto](02-Product-Strategy.md).

## Problema que resuelve

Los pequeños establecimientos turísticos administran su operación con herramientas desconectadas, como WhatsApp, Excel, cuadernos y memoria. Esto provoca pérdida de tiempo, errores operativos y falta de control.

TOP centraliza la operación en una única plataforma.

## Mercado objetivo

El mercado inicial es Paraguay. El segmento inicial comprende cabañas, posadas, glampings y hoteles boutique con aproximadamente 1 a 30 unidades. La expansión futura prevista es Latinoamérica.

Los usuarios identificados son Propietario, Administrador, Recepcionista y Consulta (`VIEWER`).

## Estado actual del MVP

### Áreas funcionales del producto

El alcance funcional aprobado comprende ocho áreas: Negocio, Recursos, Precios, Disponibilidad, Reservas, Pagos, Calendario y Dashboard.

Calendario permanece como área visible del producto. Su contrato backend inicial está cubierto por AVL-002 — Availability Calendar mediante `GET /api/businesses/:businessId/availability/calendar`; no existe una épica backend separada para Calendar.

### Dominios backend de soporte

Identity & Access, Contact y Block son dominios y capacidades técnicas necesarias para entregar las áreas funcionales aprobadas. Su presencia en el backlog backend no amplía por sí misma el alcance comercial del MVP.

El Backend MVP completó las 53 de 53 capacidades aprobadas (100%). La última historia completada es DSH-001 — Business Dashboard. Dashboard tiene sus 4 capacidades completadas (100%): DSH-002 — Occupancy KPI, DSH-003 — Revenue KPI, DSH-004 — Reservations KPI y DSH-001 como agregador público de las tres proyecciones. No quedan capacidades backend planificadas dentro del backlog MVP actual. Este cierre no declara completado el frontend, el quality gate preproducción ni el producto completo.

El estado operativo de cada capacidad se mantiene en el [Backlog](07-Backlog.md). [Estado actual](00-Current-Status.md) ofrece el handoff resumido vigente.

## Progreso por dominio del backlog backend

- Business: 5 / 5.
- Identity & Access: 9 / 9.
- Resource: 9 / 9.
- Pricing: 5 / 5.
- Availability: 4 / 4.
- Contact: 4 / 4.
- Booking: 6 / 6.
- Payment: 4 / 4.
- Block: 3 / 3.
- Dashboard: 4 / 4.

## Arquitectura general

TOP utiliza un monolito modular con DDD pragmático y arquitectura hexagonal simplificada. Las reglas de negocio viven en backend y los módulos se organizan en domain, application, infrastructure y presentation.

El sistema es multi-tenant: toda operación operativa se ejecuta dentro de un Business autorizado. La autorización se valida en backend.

La autenticación propia en NestJS para el MVP está definida en [ADR-001](13-adr/ADR-001-estrategia-autenticacion-mvp.md).

## Tecnologías principales

- TypeScript.
- NestJS.
- PostgreSQL.
- Prisma.
- REST con OpenAPI.
- Almacenamiento S3-compatible.
- Docker.
- GitHub Actions.

## Estructura documental

- [01-Vision.md](01-Vision.md): visión, mercado y alcance.
- [02-Product-Strategy.md](02-Product-Strategy.md): estrategia, Core, Extensions y no objetivos.
- [03-Domain-Bible.md](03-Domain-Bible.md): dominios, conceptos y reglas por dominio.
- [04-Business-Rules.md](04-Business-Rules.md): catálogo de reglas de negocio.
- [05-Architecture.md](05-Architecture.md): decisiones técnicas y arquitectura.
- [06-Roadmap.md](06-Roadmap.md): secuencia de evolución aprobada.
- [07-Backlog.md](07-Backlog.md): plan operativo y estado de capacidades.
- [00-Current-Status.md](00-Current-Status.md): handoff resumido del estado vigente.
- [13-adr/](13-adr/): decisiones arquitectónicas.
- [../ai/AI_CONTEXT.md](../ai/AI_CONTEXT.md): contexto común y protocolo para agentes de IA.

## Fuentes de verdad

Las decisiones de producto y dominio se consultan en los documentos `01` a `07`. El Backlog es la fuente operativa del estado y orden de capacidades; Estado actual lo resume sin reemplazarlo. Los ADRs son la fuente de las decisiones técnicas importantes. El código mergeado, las PR y GitHub CI aportan evidencia de implementación.

Ante una ausencia de información, se debe registrar **Pendiente de definición** en vez de inventar una funcionalidad o regla.
