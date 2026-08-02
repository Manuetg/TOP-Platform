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

Los usuarios identificados son Propietario, Recepcionista y Administrador.

## Estado actual del MVP

El MVP incluye Negocio, Recursos, Precios, Disponibilidad, Reservas, Pagos, Calendario y Dashboard.

La épica Business está completada al 100%: cinco de cinco capacidades. Identity & Access es la siguiente épica; la siguiente capacidad aprobada es IAM-004 — Create User. Login depende de IAM-009 — Manage User-Business Membership, que ya forma parte del backlog y debe implementarse antes de Login.

El estado operativo de cada capacidad se mantiene en el [Backlog](07-Backlog.md).

## Módulos implementados

- Business: 100% de la épica completada.
- Los demás módulos del MVP permanecen planificados, salvo decisiones documentales fundacionales de Identity & Access.

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
- [13-adr/](13-adr/): decisiones arquitectónicas.
- [../ai/AI_CONTEXT.md](../ai/AI_CONTEXT.md): contexto común y protocolo para agentes de IA.

## Fuentes de verdad

Las decisiones de producto y dominio se consultan en los documentos `01` a `07`. El backlog es la fuente operativa del estado y orden de capacidades. Los ADRs son la fuente de las decisiones técnicas importantes.

Ante una ausencia de información, se debe registrar **Pendiente de definición** en vez de inventar una funcionalidad o regla.
