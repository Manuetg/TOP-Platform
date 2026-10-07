# TOP — Roadmap

## Finanzas operativas — alcance post-MVP autorizado (2026-10-05)

Antecedente del 05/10/2026: este encargo se contabiliza separado del MVP histórico. Rolo autorizó implementar Finanzas de extremo a extremo hasta quedar listo para probar; D1–D3 están aprobadas desde el 05/10/2026 00:28 UTC. La autorización posterior «continua con el resto yo hare el merge pero no dependas de mi para avanzar» permitió comenzar desde el head revisado de PR #101, `99a51148cc12839cdc1bea3ed303961ffd27698c`, árbol `28434d484dd9013939f205fa15557de20cb1e84b`, en checkout aislado, sustituyendo para FIN-001 la espera del merge. Esa autorización no acreditaba que PR #101 estuviera mergeada.

Revalidación para publicación del 07/10/2026: PR #101 está mergeada en `develop@9332fa6b6750c0dd326d0b69df24d0ba0725d8b9`; su árbol coincide con la base Finance indicada. La comprobación de igualdad permite conservar la evidencia local asociada a los manifiestos de fuentes, sin atribuirla a un SHA de publicación todavía no probado por CI. Full12 backend, build/lint/test frontend y navegador real V1/V2/V3 móvil/desktop tienen PASS local en los alcances de [Estado actual](00-Current-Status.md). CI del nuevo HEAD y revisión/aceptación formal siguen pendientes; la mutación ampliada está `DEFERRED_BY_USER`. FIN-001–035 siguen In Progress y FIN-036/037 Blocked.

La autorización Git del 05/10/2026 00:31 UTC permite commits, pushes, PR Draft por entrega y merge normal a develop después de revisión independiente y gates, sin omitir protecciones. Como antecedente, la transición de PR #101 a Ready fue denegada `FORBIDDEN` y no se reintentó en el trabajo Finance. No autoriza despliegue, cambios de trust Git, configuración global, red, credenciales o datos reales. El advisory HIGH heredado y `releaseApproved=false` permanecen; no se reintenta la remediación deepmerge-ts/Prisma bloqueada.

| Épica | Resultado / historias | Estado inicial | Dependencia de salida |
|---|---|---|---|
| FIN-E00 | Base verificable, contratos y capabilities; FIN-001–002 | In Progress | Base revisada aislada; contratos/evidencia y revisión. |
| FIN-E01 | Gasto, líneas, obligación, origen; FIN-003–006 | In Progress | E00. |
| FIN-E02 | Cuentas, apertura, pago, vínculo de cobro, transferencias; FIN-007–010 | In Progress | E00; E01 para liquidar gastos. |
| FIN-E03 | Consulta, export, revisión, arqueo, recuperación; FIN-011–015 | In Progress | E01 + E02. |
| FIN-E04 | Importación acotada, corrección y devolución; FIN-016–018 | In Progress | E03; D2 aprobada, contrato técnico de Payment revisado. |
| FIN-E05 | Recurrencias/reintegros y matching CSV manual; FIN-019–020 | In Progress | E03/E04 según fuente; aprobación interna solo con política concreta. |
| FIN-E06 | Prestación, directos, comunes y resultado; FIN-021–024 | In Progress | E03; D1/D3 aprobadas, evidencia explícita de servicio. |
| FIN-E07 | Costo laboral calculado, presupuesto, compromiso, proyección; FIN-025–028 | In Progress | E06. |
| FIN-E08 | Cierre, contador, alertas, archivos/restore; FIN-029–032 | In Progress | E04–E07; upload/retención sujeto a contrato de FIN-032. |
| FIN-E09 | Fixtures, revisión independiente y entrega reproducible; FIN-033–035 | In Progress | Se inicia con E00 y se repite por entrega. |
| FIN-E10 | Garantías y unidades no nocturnas; FIN-036–037 | Blocked | Contratos adicionales específicos; no impiden FIN-001–035 soportadas. |

- **V1:** FIN-001–015 y FIN-033–035 sobre ese alcance: gasto → deuda → pago parcial → cuenta/caja → origen → exportación, con referencia de evidencia privada textual. Caja se deriva; cobros existentes conservan Payment como única fuente. No incluye refund ni devengo.
- **V2:** FIN-016–028 y repetición de FIN-033–035: correcciones/refunds, recurrencia manual, import/matching, reconocimiento certificado, costos, resultado y planificación. D1–D3 no se vuelven a preguntar; los contratos y bordes sí se verifican.
- **V3:** FIN-029–032 y FIN-033–035 sobre todo el alcance habilitado: cierre con fuentes protegidas, paquete reproducible, alertas internas y recuperación. FIN-032 incorpora proveedor privado opt-in, preservación sin purga y restore DB+objetos sintéticos; el corte funcional local integrado y los recorridos reales finales tienen evidencia PASS, con CI del nuevo HEAD y aceptación formal pendientes y mutación ampliada diferida. El modo sin proveedor conserva referencia textual y muestra upload deshabilitado.

Listo para probar exige entorno propio accesible, dataset sintético, PostgreSQL real, HTTP autenticado, móvil 390×844 y desktop 1440×900, revisión independiente y CI del código publicado. No equivale a piloto GO, aprobación fiscal, operación bancaria, producción ni finalización de las 54 capacidades del discovery. Estados/evidencia por historia en [Backlog](07-Backlog.md) y [Frontend Backlog](14-Frontend-Backlog.md); decisiones de dominio en [Domain Bible](03-Domain-Bible.md) y [Business Rules](04-Business-Rules.md).

### Trazabilidad del catálogo FIN01–FIN54

Los IDs del catálogo del discovery se conservan; no son IDs de historias ni un estado Completed. «Existente» se refiere al contrato Payment vigente, que requiere regresión; «parcial» conserva su límite.

| Catálogo / capacidad | Corte e historias |
|---|---|
| FIN01 Panorama; FIN03 CxC | V1 FIN-011; V2 FIN-028 para antigüedad fiable. |
| FIN02 Cobros parciales/mixtos | Payment existente + V1 FIN-009/033; sin segundo cobro editable. |
| FIN04 Anticipos/garantías | Payment cubre anticipo; garantía condicionada FIN-036. |
| FIN05 Correcciones/devoluciones | V2 FIN-017/018; neto y aplicaciones canónicas. |
| FIN06 Prestación | V2 FIN-021; unidades adicionales condicionadas FIN-037. |
| FIN07 Comisiones/liquidaciones; FIN22 Extracto; FIN23 Matching | V2 FIN-020; CSV/manual, sin bank feed. |
| FIN08 Antigüedad/deuda; FIN38 Proyección | V2 FIN-028; previsto separado de saldo registrado. |
| FIN09 Alta gasto; FIN13 División | V1 FIN-004/008; líneas exactas operativas/no operativas. |
| FIN10 Categorías/contrapartes | V1 FIN-003; archivo conserva historia. |
| FIN11 Evidencia | V1 FIN-006 textual; archivos V3 FIN-032 condicionados. |
| FIN12 CxP | V1 FIN-005/008; obligación derivada. |
| FIN14 Recurrencias; FIN15 Aprobación; FIN16 Reintegros | V2 FIN-019; borradores manuales y política de aprobación antes de habilitarla. |
| FIN17 Cuentas/aperturas | V1 FIN-007; corte explícito. |
| FIN18 Vínculos | V1 FIN-009; fuente Payment única. |
| FIN19 Transferencias; FIN24 Aportes/retiros/financiación | V1 FIN-010; fuera de resultado operativo. |
| FIN20 Arqueo | V1 FIN-014; diferencia visible. |
| FIN21 Revisión manual | V1 FIN-013; no acredita conciliación bancaria. |
| FIN25 Directos; FIN29 Estancia/rotación | V1 captura FIN-004; V2 análisis FIN-022. |
| FIN26 Comunes; FIN27 Reglas | V2 FIN-023; porcentajes/versiones y sin asignar. |
| FIN28 Resultado; FIN31 Cobertura; FIN52 Conciliar reportes | V1 cobertura FIN-011; V2 FIN-024; V3 FIN-030. |
| FIN30 Unidades/estacionalidad | V2 parcial FIN-024; unidades nuevas condicionadas FIN-037. |
| FIN33 Laboral; FIN34 Asignación; FIN35 Trabajo propio | V2 FIN-025/023; calculado externamente y detalle OWNER. |
| FIN36 Presupuesto; FIN37 Compromiso/real | V2 FIN-026/027; meta/forecast y conversión separados. |
| FIN39 Cierre | V3 FIN-029; escritores afectados y snapshot versionado. |
| FIN41 Capabilities; FIN42 Auditoría | V1 FIN-002/006; transversal. |
| FIN43 Import apertura | V2 FIN-016; apertura manual V1 no completa importación. |
| FIN44 Export operativo; FIN49 Filtros | V1 FIN-011/012; mismo corte o conflicto explícito. |
| FIN45 Contador | V3 FIN-030; sin integración/certificación fiscal. |
| FIN48 Recuperación; FIN50 Accesibilidad | V1 FIN-002/015/033/034; repetir V2/V3. |
| FIN51 Alertas | V3 FIN-031; dentro de TOP. |
| FIN53 Retención/restore | V3 FIN-032; DB + objetos reales de test. |
| FIN32 Activos/depreciación; FIN40 Fondos de propietarios; FIN46 Multimoneda; FIN47 Integraciones; FIN54 Fiscal local | F3 futuro, fuera del núcleo autorizado. No se infieren políticas ni se simulan. |

El segmento es dueño operador de recursos propios, PYG. No incorpora nómina fiscal, impuestos, FX, fondos ajenos, feeds bancarios, ejecución de transferencias ni nuevos tipos reservables. Los nombres/tipos Resource existentes no prueban contratos de turnos, horas o plazas. Toda dependencia nueva requiere necesidad y compatibilidad documentadas. Se ejecuta PLAN → IMPLEMENT → TEST → REVIEW → CORRECT → ACCEPT, con un escritor de schema/contratos compartidos y ownership por archivos; solo se paralelizan partes independientes con interfaces congeladas.

Actualización operativa del 01/10/2026: `develop@835b2a4` incluye PR #98 y #100. El primer corte de seguridad B está integrado; B restante y el quality gate preproducción permanecen abiertos. Las referencias fechadas inferiores conservan el seguimiento histórico. Los refinamientos de estados, configuración, perfil, Resources y almacenamiento web se validan solo en la rama local de integración, según [Estado actual](00-Current-Status.md), sin publicación o merge autorizado.

Decisiones pendientes derivadas de este encargo: el cambio seguro de correo requiere definir revalidación de la dirección, asociación/invalidez de tokens de verificación previos y reautenticación, conservando o revisando expresamente la regla aprobada de sesiones de IAM-005; no se implementa ese flujo. Antes de publicar documentación jurídica completa deben confirmarse operador/responsable, contacto, jurisdicción, proveedores, retención y condiciones del servicio. El inventario técnico de cookies/storage no acredita cumplimiento legal.

## Propósito

Este documento registra la secuencia de evolución del MVP y las iniciativas futuras aprobadas. El backlog operativo y el estado de las capacidades se mantienen en [07-Backlog.md](07-Backlog.md).

## Estado actual

El backlog de implementación del Backend MVP está completado: 53 de 53 capacidades (100%). Dashboard completó sus 4 capacidades: DSH-002 — Occupancy KPI, DSH-003 — Revenue KPI, DSH-004 — Reservations KPI y DSH-001 — Business Dashboard como agregador público final. No quedan capacidades backend planificadas dentro del backlog MVP aprobado. El estado operativo vigente se encuentra en [07-Backlog.md](07-Backlog.md); este cierre no implica que frontend o el quality gate preproducción estén completados.

## POST-MVP / PRODUCTION READINESS — roadmap aprobado (2026-09-24)

El baseline del Épico A, verificado al iniciarlo, fue `origin/develop@cb9eddcb5eb9fcd55008555a29bb478d71f6009a`. El trabajo posterior sobre precio manual libre parte de `origin/develop@ea0c373ee3c5e9d0bed87dcc0133b330ccdc5a22` (28/09/2026). Backend MVP histórico: **53/53 Completed**, inalterado. El frontend conserva su recuento histórico de 52 historias (51 Completed y FE-SUB-001 con decisión comercial pendiente). Este roadmap se contabiliza por separado y no declara Product Ready ni Production Ready.

Plan histórico del 24/09/2026: un épico activo = una rama = una PR con implementación, pruebas, documentación y correcciones de revisión. Secuencia A → B → C → D; E es discovery separado. Solo A se implementaba en aquella ejecución. El precio manual libre es un seguimiento independiente de A y B. Estados: Planned, In Progress, Completed, Blocked, Discovery. Completed es efectivo al merge, después de cumplir la DoD y ambos CI.

| Iniciativa | Estado | Alcance y evidencia requerida |
|---|---|---|
| A — Refinamiento funcional y UX | Completed, PR #96 integrada | A1 fechas; A2 selector/buscador Pricing; A3 teléfono internacional Contact; A4 archivo Contact; A5 ConfirmDialog; A6 inputs Booking; A7 estadía sin Rate Plan. Evidencia histórica conservada. |
| Precio manual libre y moneda visible — decisión posterior a A7 | Completed, PR #97 integrada en `7737b2b` | Manual sin referencia con cualquier cantidad de planes; prefijo monetario visible. Ambos CI SUCCESS; mutation SKIPPED; revisión PM/TL informada APPROVE WITH NOTES, evidencia y límites en Current Status. |
| B — Seguridad para producción | In Progress (primer corte) | POST-B-STARTUP: B3/B4/B6 y configuración/empaquetado de B2; B restante pendiente. |
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
- A7 (implementación histórica de PR #96): opción C aprobada el 24/09/2026. La consulta contextual backend decidía los planes seleccionables. Con planes, cálculo/override conservaba referencia; sin ninguno para Resource/estadía, OWNER/ADMIN podían confirmar precio manual excepcional con importe y motivo obligatorio. RECEPTIONIST no podía usar la excepción y VIEWER conservaba solo lectura. Esa restricción de ausencia de planes fue sustituida el 28/09/2026; el resto de las invariantes se conserva.
- DoD histórica de A: pruebas de regresión, aislamiento/permisos, estados aplicables, coherencia móvil/desktop, fechas contractuales intactas, documentación y `git diff --check`; Frontend CI y Backend CI SUCCESS. Mutation según política de aquella PR: SKIPPED no equivale a PASS. QA interactiva de PR #96 fue NOT RUN; esa excepción no se aplica a la decisión del 28/09/2026. Sin infraestructura accidental ni TODO funcional oculto.

### POST-A7 — Discovery histórico de precio manual sin Rate Plan (revisión final PR #96)

**DECISIÓN HISTÓRICA: C (24/09/2026).** Producto aprobó el híbrido excepcional en PR #96 para superar el bloqueo de todos los roles ante cero planes. La restricción de ausencia de planes quedó sustituida por la decisión del 28/09/2026 registrada debajo; esta comparación se conserva como historial de la decisión anterior.

| Alternativa evaluada | Beneficio | Costo o riesgo |
|---|---|---|
| A — Manual siempre sobre plan | Referencia comercial y comparación de descuentos inequívocas. | Configurar Pricing es requisito previo para confirmar. |
| B — Manual independiente | Operación libre aun sin configuración tarifaria. | Pricing se vuelve opcional incluso habiendo planes y pierde referencia. |
| C — Híbrido excepcional (elegida en PR #96) | Conserva la referencia cuando hay plan y permite operar cuando no hay ninguno aplicable. | Exige verificar elegibilidad, permiso y motivo en backend al confirmar. |

Implementación histórica: `MANUAL_NO_RATE_PLAN` solo para OWNER/ADMIN, monto entero seguro no negativo en moneda del Business y motivo obligatorio de 2..500 caracteres. El request omitía `ratePlanId`; sin el modo explícito seguía siendo obligatorio. La aparición de un plan aplicable en la preparación de la confirmación producía 409 y permitía resolver la misma reserva PENDING. Ese 409 por catálogo es obsoleto; se conservan aislamiento, estados activos, estadía máxima de 365 noches, disponibilidad y transacción/auditoría.

Snapshot: origen discriminado, plan/sugerido/ajuste nulos, desglose vacío y total acordado. Los precios históricos CALCULATED/MANUAL_OVERRIDE permanecen intactos. `items` ya es JSON; no hace falta migración SQL adicional. Se prueba la lectura con PaymentPlan, Payments, saldo y Revenue. No se crean planes ficticios ni se cuenta la excepción como descuento.

Reportes futuros deberán distinguir precio sin referencia de descuento. No existe hoy un reporte de descuentos que modificar. Agente TOP/automatización futura siguen fuera del alcance: deberán consumir permisos/contratos backend y no inferir precios ni privilegios. Esta decisión no autoriza agentes, workers ni automatizaciones.

### Decisión vigente — precio manual libre y moneda visible (2026-09-28)

Producto sustituye la condición de opción C que exigía ausencia de tarifarios. OWNER/ADMIN pueden elegir Manual y confirmar el total acordado para la estadía con cero, uno o varios planes aplicables. `MANUAL_NO_RATE_PLAN` significa que el precio registrado carece de plan referenciado; no demuestra ausencia de planes en el catálogo. El request declara `pricingMode`, `resourceId`, `agreedAmountMinor` y `overrideReason`, omite `ratePlanId` por completo y rechaza combinaciones contradictorias. El importe es entero seguro no negativo, incluido cero; el motivo obligatorio tiene 2..500 caracteres tras trim. La moneda procede del Business; PYG mantiene escala 1:1.

Calendar y Confirm Booking muestran Configurada y Manual a usuarios autorizados. Configurada conserva selección, cálculo y descuentos; Manual no necesita selector ni preview, y permanece operable durante carga, error o refetch del catálogo sin perder foco ni valores. Cambios reales de identidad, Business, Booking, Resource o fechas invalidan el borrador anterior. El símbolo monetario permanece dentro del borde del input, separado del valor editable y accesible por nombre/ayuda; `₲ 450.000` se envía como `450000` PYG. Se conservan permisos, estados activos, Contact y Resources válidos, fechas, disponibilidad, no doble reserva, Snapshot/Timeline atómicos, historial y reglas de PaymentPlan, Payments, saldo y Revenue. No se añade endpoint, tabla, migración ni estado de Booking por esta decisión.

La entrega requiere corregir las pruebas que asumían referencia obligatoria o 409 por aparición de planes, mantener regresiones de conflictos reales y cubrir cero/uno/varios planes, refetch, cambios de contexto, PYG y roles. Backend exige lint, build, unitarias, integración PostgreSQL, E2E, aceptación, cobertura, arquitectura y Prisma; frontend exige build, lint y test. QA móvil y desktop de ambos flujos, `git diff --check` y ambos CI del HEAD final si se publica. Mutation SKIPPED no equivale a PASS.

### B — Seguridad para producción (In Progress, primer corte)

**POST-B-STARTUP (30/09/2026), In Progress preparado para re-revisión:** [PR #98](https://github.com/Manuetg/TOP-Platform/pull/98) contra develop `7737b2b`, rama `codex/production-startup-hardening`, con implementación/documentación juntas y publicación autorizada el 30/09/2026. Configuración crítica validada antes de listen, límites técnicos de los cuatro TTL compatibles con Date/Prisma, CORS explícito, Swagger ausente en producción, SMTP TLS y S3 obligatorio, imagen production/Compose development, exclusión de secretos y `.env` fuera del índice conservado localmente. No completa B2 cloud ni el épico; B1/B5/B7/B8/B9/B10 permanecen Planned. Sin cambios de dominio/schema, frontend, migraciones nuevas, deploy ni infraestructura. Gates locales y limitaciones en [Estado actual](00-Current-Status.md); feature HEAD y ambos CI oficiales en el cuerpo de PR #98. Completed solo tras revisión/merge y CI del HEAD publicado.

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
- Hallazgo de instalación de POST-B-STARTUP (30/09/2026): `npm ci` informó 16 vulnerabilidades en el árbol vigente (7 moderadas, 9 altas). No se modificaron dependencias ni lockfiles en ese corte. Evaluar remediación y compatibilidad en el quality gate posterior, sin `audit fix` automático ni presentar este hallazgo como resuelto.
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
