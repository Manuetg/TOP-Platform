# TOP — Roadmap

## Propósito

Este documento registra la secuencia de evolución del MVP y las iniciativas futuras aprobadas. El backlog operativo y el estado de las capacidades se mantienen en [07-Backlog.md](07-Backlog.md).

## Estado actual

El backlog de implementación del Backend MVP está completado: 53 de 53 capacidades (100%). Dashboard completó sus 4 capacidades: DSH-002 — Occupancy KPI, DSH-003 — Revenue KPI, DSH-004 — Reservations KPI y DSH-001 — Business Dashboard como agregador público final. No quedan capacidades backend planificadas dentro del backlog MVP aprobado. El estado operativo vigente se encuentra en [07-Backlog.md](07-Backlog.md); este cierre no implica que frontend o el quality gate preproducción estén completados.

## POST-MVP / PRODUCTION READINESS — roadmap aprobado (2026-09-24)

Baseline verificado con `git fetch`: `origin/develop@cb9eddcb5eb9fcd55008555a29bb478d71f6009a`, sin PR abiertas al iniciar. Backend MVP histórico: **53/53 Completed**, inalterado. El frontend conserva su recuento histórico de 52 historias (51 Completed y FE-SUB-001 con decisión comercial pendiente). Este roadmap se contabiliza por separado y no declara Product Ready ni Production Ready.

Un épico activo = una rama = una PR con implementación, pruebas, documentación y correcciones de revisión. Secuencia A → B → C → D; E es discovery separado. Solo A se implementa en esta ejecución. Estados: Planned, In Progress, Completed, Blocked, Discovery. Completed es efectivo al merge, después de cumplir la DoD y ambos CI.

| Iniciativa | Estado | Alcance y evidencia requerida |
|---|---|---|
| A — Refinamiento funcional y UX | Completed efectivo al merge de PR #96 | A1 fechas; A2 selector/buscador Pricing; A3 teléfono internacional Contact; A4 archivo Contact; A5 ConfirmDialog; A6 inputs Booking; A7 estadía sin Rate Plan. Una PR `POST-MVP: UX & Functional Refinement` desde `post-mvp/ux-functional-refinement`. |
| B — Seguridad para producción | Planned | B1–B10 siguientes; decisiones sustentadas en riesgos reales. |
| C — Escalabilidad de API y base de datos | Planned | C1–C6 siguientes; medición antes de optimizar. |
| D — Assets y performance | Planned | D1–D10 siguientes; conservar capacidades ya integradas. |
| E — Automatización del ciclo de Booking | Discovery | Resolver semántica operativa antes de implementar automatización. |

### A — Criterios de entrega

- A1: fechas puras visibles `dd/mm/yyyy`, helpers compartidos sin timezone accidental. Contrato/inputs nativos permanecen `YYYY-MM-DD`; instantes UTC/RFC3339 se presentan en timezone IANA del Business. Auditar Calendar, Booking, Pricing, Payments, Blocks, Dashboard, timelines y detalles/listados. Probar bisiestos, null, fechas, instantes y timezone.
- A2: selector/buscador/listado de planes con hover discreto, pressed, selected, focus-visible, tacto y reduced motion usando Foundation.
- A3: país, prefijo visible, entrada nacional/internacional y WhatsApp consistentes; validación backend compatible con E.164; edición conserva teléfonos históricos ambiguos sin migración inferida. Reutilizar metadatos existentes o una dependencia acotada justificada, sin catálogo mundial manual.
- A4: `PATCH /api/businesses/:businessId/contacts/:contactId/archive`, tenant-scoped, `contact.write`, Business activo, respuesta pública, archivo idempotente desde ACTIVE/INACTIVE y repetición sin duplicar auditoría. Preservar reservas e historial; sin Restore. Confirmación TOP, permisos, loading/error/success e invalidación de caché en detalle.
- A5: ConfirmDialog compartido sobre OverlayPanel, título/descripción, confirmar/cancelar, variante sensible, loading/disabled, foco/Tab/Escape/retorno, aria-modal y reduced motion. Aplicar en acciones sensibles existentes, incluido Resources.
- A6: inputs Booking alineados a shared forms conservando labels, ayuda/error, foco, disabled, responsive y RHF/Zod donde existen. Sin rediseño masivo.
- A7: la consulta contextual backend decide los planes seleccionables. Sin planes: «No hay un tarifario disponible para esta estadía», sin modo configurado funcional. El contrato vigente de ConfirmBooking y ApplyManualPriceOverride **requiere un Rate Plan también para override**; por ello sin planes se bloquea a todos los roles y se explica que debe configurarse una tarifa. Con planes, OWNER/ADMIN conservan override y los demás sus permisos actuales. Probar carga, cero/uno/varios, error, cambios de Resource/fechas/Business, respuestas tardías y teclado.
- DoD: pruebas de regresión, aislamiento/permisos, estados aplicables, coherencia móvil/desktop, fechas contractuales intactas, documentación y `git diff --check`; Frontend CI y Backend CI SUCCESS. Mutation según política vigente: SKIPPED no equivale a PASS. QA interactiva NOT RUN salvo necesidad concreta o petición expresa. Sin infraestructura accidental ni TODO funcional oculto.

### B — Seguridad para producción (Planned)

- B1: auditar rate limiting de signup, login, forgot-password, verify-reset-code, reset-password, resend-verification, verify-email y refresh cuando corresponda. IP + identidad/email normalizada + endpoint + ventana, 429/Retry-After, sin enumeración y con múltiples instancias Cloud Run. Memoria local no basta; comparar alternativas sin elegir Redis automáticamente.
- B2: DATABASE_URL, claves JWT, SMTP, storage y terceros fuera de repositorio/imágenes; evaluar Secret Manager y Workload Identity. Nunca secretos VITE_*.
- B3: configuración crítica fail-fast con NODE_ENV=production.
- B4: CORS fail-closed con origins explícitos; auditar fallback abierto.
- B5: evaluar Helmet/equivalente y compatibilidad antes de incorporar dependencias.
- B6: Swagger deshabilitado o protegido en producción; auditar rutas debug/test/seed.
- B7: manejo global seguro de excepciones: 4xx contractuales, 500 genérico, stack solo interno; no filtrar SQL, paths, secretos ni payload sensible.
- B8: logs JSON compatibles con Cloud Logging: timestamp, level, requestId/correlationId, método, ruta, status, duración y userId/businessId cuando corresponda. Excluir passwords, JWT, refresh/verification tokens, reset codes, SMTP password, Authorization y datos sensibles.
- B9: acceso privado Cloud Run → Cloud SQL y usuario DB de mínimo privilegio; ningún cliente accede directamente a DB.
- B10: discovery/ADR/prototipo RLS: clasificar tablas globales, tenant-owned y tenant-derived; estudiar Prisma, transacciones, variables de sesión, pooling, migraciones, jobs/admin, bypass owner y tests. Defensa adicional a guards/repositories, sin activar RLS globalmente por checklist.

### C — Escalabilidad (Planned)

- C1: paginación de Contacts y Bookings, cursor estable cuando convenga; Payments/Timeline ya tienen cursor, no duplicar.
- C2: diseñar pooling Cloud Run/Cloud SQL: máximo de instancias × conexiones por instancia menor que capacidad segura DB.
- C3: inventario de queries, EXPLAIN ANALYZE, consultas lentas, selectividad y costo de escritura antes de agregar índices; respetar los índices existentes.
- C4: detectar N+1 reales (loops con acceso DB), conservar queries sanas.
- C5: medir payloads antes de Brotli/gzip en infraestructura apropiada.
- C6: medir Dashboard/Search/Availability antes de cachear; si se justifica, definir TTL, claves por tenant, invalidación y consistencia. Sin Redis automático.

### D — Assets y performance (Planned)

- D1: auditar uploads; variantes thumbnail/medium/original según necesidad, resize/WebP/AVIF/tamaño/metadatos/signed URLs/cache headers. Preservar originales con estrategia explícita.
- D2 — Completed existente: React.lazy/Suspense y división por rutas integrados; no reimplementar.
- D3 — Completed existente: minificación de producción Vite; no duplicar.
- D4 — Completed existente: TanStack Query; auditar staleTime/gcTime solo ante beneficio concreto, sin otra caché global.
- D5: evaluar CDN de estáticos/imágenes y cache headers tras definir despliegue Google Cloud.
- D6: React Profiler antes de useMemo/useCallback; optimizar costos demostrados.
- D7: debounce solo para búsquedas remotas (Global Search, Contact y futuros autocomplete), nunca inputs normales.
- D8: skeletons donde reduzcan saltos de layout o mejoren percepción, no por estética.
- D9: auditar dependencias sin uso; verificar consumidores/build/tests antes de retirarlas.
- D10: baseline Lighthouse Login/Dashboard/Calendar/Resources/Booking Detail, desktop y móvil; LCP, CLS, INP, assets dominantes y recursos bloqueantes. Objetivos orientativos: accesibilidad/buenas prácticas ≥95, performance móvil ≥85/desktop ≥90; no gates hasta medir, no perseguir 100 artificialmente.

### E — Ciclo de Booking (Discovery)

No asumir CONFIRMED → IN_PROGRESS al llegar checkInDate. Determinar si IN_PROGRESS significa fecha alcanzada o check-in confirmado y distinguir confirmada, llega hoy, check-in real, en estadía, sale hoy, check-out, no-show, completed y cancel. Evaluar estados derivados ARRIVES_TODAY/CURRENT_STAY/DEPARTS_TODAY/OVERDUE_CHECKIN sin persistirlos necesariamente. Solo tras aprobación, evaluar Cloud Scheduler → Cloud Run Job/endpoint SYSTEM protegido → caso de uso idempotente con timezone del Business; nunca setInterval/while permanente dentro de NestJS. Sin implementación en esta ejecución.

### Capacidades integradas que se conservan

ProtectedRoute, guards globales de autenticación/autorización, apiRequest, manejo frontend seguro de 5xx, TanStack Query, rutas diferidas, minificación Vite, índices PostgreSQL, Calendar Business-local, PYG 1:1, aislamiento por Business, AbortSignal en varios flujos y ambos workflows CI ya existen. Solo un gap demostrado justifica trabajo nuevo.

## Áreas funcionales del producto (MVP histórico)

El MVP mantiene las ocho áreas aprobadas en Vision y Product Strategy: Negocio, Recursos, Precios, Disponibilidad, Reservas, Pagos, Calendario y Dashboard. Identity & Access, Contact y Block son dominios backend de soporte y no representan áreas comerciales adicionales.

Calendario es un área funcional visible. Su capacidad backend inicial está cubierta por AVL-002 — Availability Calendar y no requiere una épica backend `Calendar` separada. En frontend, el alcance MVP vigente dispone de `/app/calendar` como centro operativo que compone Availability, Resources, Bookings y Blocks, con matriz desktop, calendario mensual mobile y creación contextual de reservas reutilizando los contratos existentes. Esta composición no crea un nuevo dominio backend ni replica reglas autoritativas. Cualquier ampliación futura deberá incorporarse al Backlog mediante aprobación explícita.

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

Por solicitud del usuario, se conservan como propuestas pendientes de discovery los contratos reales de próximos check-ins, resumen de llegadas/salidas del día, actividad reciente y próximos pasos. FE-DSH-001 incorpora sus componentes visuales con mocks explícitos aislados y etiqueta «Vista previa»; FE-DSH-002..005 registran el reemplazo por datos reales. No implican una nueva capacidad backend aprobada. Antes de conectar los datos se deben definir semántica, fuente, endpoint, autorización y alcance; no se presupone que otros listados resuelvan esos agregados. Las comparaciones con períodos anteriores permanecen fuera del Dashboard actual, incluso como mock.

Los previews de Recursos y Precios se incorporan a FE-DSH-001 por la nueva decisión visual, consumiendo sus contratos existentes y mostrando hasta cuatro recursos y tres tarifas; no completan FE-PRI-001. La composición local del rail no completa su generalización en FE-FND-006. Estas decisiones no alteran el total backend de 53.
