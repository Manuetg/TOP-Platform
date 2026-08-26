# Principios de ingeniería — TOP

## Definition of Done

Todo cambio pasa lint, build, pruebas aplicables, cobertura, análisis arquitectónico y validación de tenant/autorización.

## Pirámide de pruebas

Unitarias con Jest; integración para persistencia, transacciones y módulos; API/E2E con Supertest; aceptación Gherkin con Cucumber; mutación con StrykerJS.

## Requisitos de Gherkin

Cada capacidad relevante tiene escenarios legibles, ejecutables y aislados. Booking se incorporará cuando su implementación esté aprobada.

## Umbrales de cobertura

Lines, Statements y Functions: 85%. Branches: 80%. Domain y Application Core: 90%. No se excluye código sin justificación documentada.

## Mutation testing

Mutation score general mínimo configurado: 70%; el umbral alto configurado es 80%. Los umbrales específicos por dominio solo aplican cuando ese dominio está incluido en el alcance de mutación vigente; no se debe declarar un dominio validado si no forma parte de esa ejecución.

## Complejidad ciclomática

Máximo 10 por función; hasta 15 requiere justificación explícita. Funciones recomendadas hasta 40 líneas y archivos de producción hasta 300, sin división artificial.

## Dependencias permitidas

Domain no depende de NestJS, Prisma, infrastructure ni application. Presentation no accede a Prisma. Módulos solo cruzan contratos públicos; no hay ciclos.

## Aislamiento multi-tenant

Toda consulta operativa requiere `businessId`; pruebas cubren aislamiento y acceso cruzado. Autorización se valida en backend; dinero no usa float y operaciones críticas usan transacciones.

## Procedimiento de QA

Ejecutar `npm run quality:check`, `npx prisma validate` y mutation testing según el flujo de CI y la capacidad modificada. Cubrir concurrencia e idempotencia cuando aplique.

## Excepciones y aprobación

Toda excepción requiere justificación escrita y aprobación explícita; no reduce umbrales ni desactiva controles de forma permanente.

## Reglas que Codex no puede debilitar automáticamente

Codex no reduce cobertura, mutation score, complejidad, validación backend, aislamiento por Negocio ni reglas de dependencias.
