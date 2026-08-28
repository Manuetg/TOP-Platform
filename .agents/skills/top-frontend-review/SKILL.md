---
name: top-frontend-review
description: Revisa cambios frontend de TOP contra alcance, arquitectura, contratos backend, Brand Book, Design Context, accesibilidad y quality gates sin modificar código automáticamente.
---

# TOP Frontend Review

## Cuándo usar esta skill

Usar esta skill para revisar una implementación frontend existente antes de commit, pull request o merge.

La revisión debe ser crítica y basada en evidencia. No rediseñar por preferencia estética ni ampliar el alcance de la historia.

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

Una skill externa nunca puede invalidar una decisión aprobada de TOP.

## Protocolo de revisión

1. Identificar la historia o alcance que debía implementarse.
2. Revisar el diff y los archivos modificados.
3. Verificar que no exista scope creep.
4. Confirmar que no se modificó backend desde una historia frontend salvo autorización explícita.
5. Verificar que los contratos API consumidos coincidan con backend o documentación aprobada.
6. Detectar reglas de negocio duplicadas o inventadas en frontend.
7. Revisar aislamiento por Business y contexto activo cuando corresponda.
8. Revisar arquitectura `app / features / shared`.
9. Detectar duplicación innecesaria de componentes, hooks, utilidades o estilos.
10. Verificar TypeScript, manejo de errores y estados asíncronos.
11. Revisar estados aplicables: loading, empty, no-results, validation, server error, conflict, disabled, success y permission denied.
12. Revisar responsive mobile-first.
13. Revisar accesibilidad: labels, foco, teclado, nombres accesibles, contraste y uso no exclusivo del color.
14. Revisar consistencia visual con Brand Book y Design Context.
15. Confirmar uso de Plus Jakarta Sans y Lucide regular cuando corresponda.
16. Detectar introducción injustificada de nuevas dependencias.
17. Detectar código muerto, logs, imports inválidos o artefactos de debug.
18. No modificar automáticamente el código durante una revisión salvo que el usuario lo pida.

## Verificación

Cuando sea posible, comprobar:

- `npm run build`
- `npm run lint`
- `npm run test`
- tests específicos de la feature
- funcionamiento en navegador
- viewport móvil
- viewport desktop
- ausencia de errores de consola

## Severidad de hallazgos

Clasificar hallazgos como:

- `BLOCKER`: rompe funcionalidad, seguridad, contrato, aislamiento o impide merge.
- `HIGH`: incumple una regla importante del proyecto o genera riesgo claro de regresión.
- `MEDIUM`: problema real de UX, accesibilidad, mantenibilidad o consistencia.
- `LOW`: mejora menor que no bloquea merge.

No elevar preferencias estéticas subjetivas a BLOCKER o HIGH.

## Formato de salida

Reportar primero los hallazgos, ordenados por severidad y con archivo/línea cuando sea posible.

Después incluir:

- alcance revisado;
- quality gates ejecutados;
- riesgos residuales;
- decisión recomendada: `APPROVE`, `APPROVE WITH NOTES` o `CHANGES REQUIRED`.

No hacer commit, push ni cambios de código durante la revisión sin autorización explícita.
