# Instrucciones oficiales del proyecto TOP

TOP es una plataforma SaaS para pequeños establecimientos turísticos de Paraguay y Latinoamérica.

## Fuente de verdad

Antes de realizar cualquier tarea, leer según corresponda:

1. docs/01-Vision.md
2. docs/02-Product-Strategy.md
3. docs/03-Domain-Bible.md
4. docs/04-Business-Rules.md
5. docs/05-Architecture.md
6. docs/06-Roadmap.md
7. docs/07-Backlog.md

Para frontend, además leer:

8. docs/10-Brand-Book-v1.md
9. docs/design/DESIGN.md
10. docs/14-Frontend-Backlog.md

Para decisiones complementarias de diseño, consultar los documentos dentro de docs/design/.

## Jerarquía

Ante conflicto, prevalece:

1. Dominio y Business Rules.
2. Backlog y alcance aprobado.
3. Arquitectura.
4. Brand Book.
5. Design Context.
6. Skills internas de TOP.
7. Skills externas.
8. Defaults del modelo.

Ninguna skill externa puede reemplazar decisiones aprobadas de TOP.

## Reglas obligatorias

1. No inventar funcionalidades ni reglas.
2. No modificar decisiones aprobadas sin autorización explícita.
3. Mantener toda la documentación en español.
4. No ampliar el alcance del MVP.
5. Las ideas futuras deben registrarse únicamente en docs/06-Roadmap.md.
6. No colocar reglas de negocio en el frontend.
7. Mantener el aislamiento de datos por Negocio.
8. Priorizar simplicidad, mobile first y velocidad operativa.
9. No eliminar información histórica o financiera.
10. Toda modificación relevante debe ser auditable.
11. Antes de modificar archivos, presentar un plan breve.
12. Después de modificar archivos, mostrar:
    - archivos modificados;
    - resumen;
    - supuestos;
    - validaciones realizadas;
    - decisiones pendientes.
13. No hacer commit ni push sin autorización explícita.
14. No crear documentación adicional salvo que sea necesaria para implementar una funcionalidad aprobada.
15. El objetivo principal es avanzar hacia un MVP funcionando, no aumentar indefinidamente la documentación.

## Reglas frontend

1. Mantener la arquitectura existente basada en app, features y shared.
2. Consumir API mediante la capa compartida del frontend.
3. No modificar backend para resolver una inconsistencia detectada desde una historia frontend; registrar el hallazgo.
4. Respetar Plus Jakarta Sans, Lucide regular, paleta Bosque y arcilla y los tokens definidos por TOP.
5. No introducir nuevas tipografías, librerías de iconos, paletas o patrones visuales sin una decisión documentada.
6. Mantener WCAG 2.2 AA como objetivo mínimo.
7. Diseñar e implementar los estados aplicables además del happy path.
8. Mantener el Business activo visible en flujos operativos.
9. Para cambios de UI, verificar al menos móvil y desktop en navegador.
10. Antes de considerar una tarea frontend terminada, ejecutar:
    - npm run build
    - npm run lint
    - npm run test

## Skills

Para implementación de historias frontend usar `.agents/skills/top-frontend-feature/SKILL.md`.

Para revisión previa a commit o PR usar `.agents/skills/top-frontend-review/SKILL.md`.

`redesign-existing-projects` puede utilizarse únicamente como auditoría auxiliar. Sus recomendaciones visuales están subordinadas al Brand Book y al Design Context de TOP.
