# TOP — Contexto común para agentes de IA

## Propósito

Establecer un contexto único y un protocolo de trabajo para los agentes de IA de TOP. Este documento no reemplaza las fuentes de verdad del proyecto.

## Lectura inicial obligatoria

1. [AGENTS.md](../AGENTS.md).
2. [Contexto del proyecto](../docs/00-Project-Context.md).
3. [Visión](../docs/01-Vision.md).
4. [Estrategia de producto](../docs/02-Product-Strategy.md).
5. [Domain Bible](../docs/03-Domain-Bible.md).
6. [Business Rules](../docs/04-Business-Rules.md).
7. [Arquitectura](../docs/05-Architecture.md).
8. [Roadmap](../docs/06-Roadmap.md).
9. [Backlog](../docs/07-Backlog.md).
10. [ADRs](../docs/13-adr/).

Para cambios de backend, leer también [Principios de ingeniería](ENGINEERING_PRINCIPLES.md).
Para tareas de diseño, leer también [Design Context](../docs/design/DESIGN.md) y [Brand Book v1](../docs/10-Brand-Book-v1.md). `08-Fundamentos-de-Diseno-de-Producto.md` contiene decisiones visuales provisionales anteriores.

## Principios compartidos

- La documentación es la fuente de verdad.
- No inventar funcionalidades, reglas ni decisiones.
- Mantener aislamiento por Business y autorización en backend.
- No ampliar el MVP sin autorización explícita.
- Mantener los documentos en español y los enlaces relativos.
- Registrar las decisiones importantes mediante ADR.
- No hacer commit ni push sin autorización explícita.

## Responsabilidades comunes

- Actuar únicamente dentro del alcance autorizado.
- Mantener trazabilidad entre una solicitud, el backlog, las reglas y los ADRs.
- Señalar dependencias, conflictos y decisiones pendientes antes de asumirlas.

## Puede modificar

Solo los archivos expresamente autorizados por la solicitud actual y necesarios para cumplirla.

## No puede modificar

- Archivos o directorios fuera del alcance autorizado.
- Decisiones aprobadas, reglas de negocio, estados de backlog o controles de calidad sin autorización explícita.
- Información histórica sin aprobación.

## Forma de trabajo

1. Analizar impacto y comunicar un plan breve antes de modificar.
2. Consultar los documentos aplicables y el backlog.
3. Limitar el cambio al alcance autorizado.
4. Marcar como **Pendiente de definición** la información no aprobada.
5. Ejecutar validaciones proporcionales al cambio.
6. Informar archivos modificados, resumen, supuestos, validaciones y pendientes.

## Límites comunes

Ningún agente puede eliminar información existente, reducir controles de calidad, cambiar decisiones aprobadas, incorporar datos sensibles a logs ni asumir permisos o contexto de Business no documentados.

## Definición de éxito común

El resultado es consistente con las fuentes de verdad, limitado al alcance autorizado, verificable y deja explícitos los supuestos y pendientes.
