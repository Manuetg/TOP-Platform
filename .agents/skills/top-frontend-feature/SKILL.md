---
name: top-frontend-feature
description: Implementa historias frontend de TOP respetando dominio, Brand Book, Design Context, contratos backend, alcance de backlog y quality gates del proyecto.
---

# TOP Frontend Feature

## Cuándo usar esta skill

Usar esta skill para implementar, completar o modificar una historia frontend de TOP, por ejemplo `FE-IAM-002`, `FE-BKG-003` o cualquier tarea equivalente dentro de `docs/14-Frontend-Backlog.md`.

No usarla para modificar backend, reglas de negocio, contratos API, arquitectura global o branding sin una historia aprobada que lo requiera.

## Jerarquía obligatoria

Ante cualquier conflicto, respetar este orden:

1. `docs/03-Domain-Bible.md` y `docs/04-Business-Rules.md`
2. `docs/07-Backlog.md` y `docs/14-Frontend-Backlog.md`
3. `docs/05-Architecture.md`
4. `docs/10-Brand-Book-v1.md`
5. `docs/design/DESIGN.md`
6. documentación complementaria en `docs/design/`
7. esta skill
8. skills externas
9. preferencias o defaults del modelo

Una skill externa nunca puede reemplazar decisiones aprobadas de TOP.

## Protocolo de implementación

1. Identificar la historia exacta solicitada y su alcance.
2. Leer los documentos relevantes antes de modificar código.
3. Inspeccionar la implementación frontend existente antes de crear componentes nuevos.
4. Identificar los contratos backend que consume la historia.
5. No asumir campos, estados, permisos, endpoints ni reglas no respaldadas por contrato o documentación.
6. Si existe una inconsistencia de contrato backend, registrar el hallazgo y no corregir backend desde una historia frontend.
7. Presentar un plan breve antes de modificar archivos.
8. Implementar únicamente el alcance solicitado.
9. Reutilizar componentes, patrones y utilidades existentes cuando sean adecuados.
10. Mantener la arquitectura `app / features / shared`.
11. Consumir APIs mediante la capa compartida definida por el proyecto.
12. No duplicar reglas de negocio ni autorización en frontend.
13. Implementar estados aplicables: default, loading, empty, no-results, error, validation, conflict, disabled, success y permission denied.
14. Mantener diseño mobile-first y adaptar progresivamente a tablet y desktop.
15. Respetar `Plus Jakarta Sans`, `Lucide regular`, paleta Bosque y arcilla, spacing, radios, foco y motion definidos por TOP.
16. No introducir otra fuente, iconografía, paleta, librería visual o patrón decorativo sin decisión documentada.
17. Mantener WCAG 2.2 AA como mínimo.
18. No usar color como única señal de estado.
19. Mantener el Business activo visible cuando el flujo opere dentro de un Negocio.
20. Usar lenguaje visible del alojamiento y evitar entidades técnicas cuando no corresponda.
21. No hacer commit ni push.

## Verificación obligatoria

Después de implementar:

1. Ejecutar tests relevantes de la feature.
2. Ejecutar:
   - `npm run build`
   - `npm run lint`
   - `npm run test`
3. Para cualquier cambio de UI, verificar en navegador:
   - flujo principal;
   - loading;
   - error;
   - foco y teclado cuando corresponda;
   - viewport móvil;
   - viewport desktop.
4. Confirmar que no se introdujeron errores de consola ni requests inesperados.
5. Revisar que no se haya modificado backend por accidente.

## Formato de cierre

Al terminar, informar:

- archivos modificados;
- historia implementada;
- resumen de cambios;
- supuestos;
- contratos backend utilizados;
- validaciones ejecutadas;
- resultados de build/lint/tests;
- verificación de navegador;
- decisiones pendientes o bloqueos;
- cambios no realizados por estar fuera de alcance.

No hacer commit ni push sin autorización explícita.
