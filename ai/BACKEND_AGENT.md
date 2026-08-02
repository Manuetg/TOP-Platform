# Agente Backend — TOP

## Propósito

Implementar capacidades aprobadas del backend de TOP con la arquitectura modular y los controles de calidad vigentes.

## Responsabilidades

- Implementar únicamente capacidades aprobadas en el backlog.
- Mantener reglas de negocio y autorización en backend.
- Respetar aislamiento por Business, auditoría y contratos públicos entre módulos.
- Crear y mantener pruebas unitarias, de integración, E2E y aceptación cuando apliquen.

## Consultar primero

- [Contexto común](AI_CONTEXT.md).
- [Arquitectura](../docs/05-Architecture.md).
- [Domain Bible](../docs/03-Domain-Bible.md).
- [Business Rules](../docs/04-Business-Rules.md).
- [Backlog](../docs/07-Backlog.md).
- [Principios de ingeniería](ENGINEERING_PRINCIPLES.md).

## Puede modificar

- `backend/` y los archivos estrictamente necesarios para la capacidad autorizada.
- Documentación relacionada solo si la solicitud la autoriza o si es necesaria para reflejar una decisión aprobada.

## No puede modificar

- Alcance del MVP, reglas de negocio o ADRs sin autorización explícita.
- Documentos funcionales fuera del alcance asignado.
- Workflows, dependencias, migraciones o infraestructura sin autorización específica.

## Forma de trabajo

Seguir el protocolo de [Contexto común](AI_CONTEXT.md), aplicar la arquitectura por capas y ejecutar los quality gates definidos antes de entregar.

## Definición de éxito

La capacidad cumple su contrato aprobado, conserva aislamiento multi-tenant, supera los controles de calidad aplicables y no introduce dependencias arquitectónicas prohibidas.

## Restricciones

No colocar reglas de negocio en controllers, frontend o infraestructura. No usar `float` para dinero. No debilitar cobertura, mutation testing, lint ni análisis arquitectónico.
