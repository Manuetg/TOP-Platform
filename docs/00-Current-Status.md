# TOP — Estado actual y handoff

Última actualización: 2026-10-02

## Candidato local de reservas — 2026-10-02

Trabajo local autorizado posteriormente a la revisión documental, aislado en `C:\Users\Sady\Documents\Codex\2026-09-30\task-2\TOP-Reservations-Integrated`, rama `codex/reservations-pilot-20261002`, base `0dc22cd18c403fb0446818c7bb57b63e26820f0c` de PR101. El remoto consultado sólo en lectura el 02/10 sigue en `develop@835b2a4397bb3e6f04480386e62b11c86a74e8a5`; [PR101](https://github.com/Manuetg/TOP-Platform/pull/101) continúa abierta como Draft, sin merge. Las evidencias inferiores conservan su fecha y SHA; no acreditan este conjunto. Checkout principal y servicios ajenos no se modifican.

### Contratos integrados y límites

- Los CTA Crear reserva del listado, Resource y Dashboard llevan a Calendario. `/app/bookings/new` redirige con `replace` bajo las protecciones existentes de sesión y Business. VIEWER puede consultar Calendario y carece de acciones de creación; los enlaces no preseleccionan Resource.
- Calendario crea directamente una Booking PENDING con precio acordado, Snapshot, Resources y Timeline atómicos. No persiste un DRAFT o CONFIRMED intermedio. El primer Payment RECORDED efectivo, de importe estrictamente positivo, confirma PENDING; no exige 50 %. Cero, fallos y reintentos idempotentes no producen confirmaciones adicionales ni reabren reservas terminales.
- Estado operativo y situación financiera se muestran por separado. Los importes y porcentajes usan enteros exactos; un pago mínimo visible no se redondea a cero y una deuda restante no se presenta como 100 % pagado. Los demás módulos conservan sus estados propios y la historia existente.
- OWNER/ADMIN/RECEPTIONIST registran ingreso CONFIRMED → IN_PROGRESS, salida IN_PROGRESS → COMPLETED y No show CONFIRMED → NO_SHOW. Confirmar sin cobro permite PENDING → CONFIRMED sólo cuando el **precio vigente** es exactamente cero y se valida disponibilidad; no crea Payment. Se consulta la revisión vigente bajo locks de Booking/Snapshot, incluyendo original cero revisado a positivo y el caso inverso. Cada operación exige versión canónica, actualiza versión monotónicamente y escribe Timeline en la misma transacción; motivo opcional de 2 a 500 caracteres cuando se proporciona.
- La edición implementada comprende reservas con precio PENDING/CONFIRMED, conservando el mismo Resource: contacto, fechas, tarifa, huéspedes y notas. Antes de guardar requiere un preview vigente; cambios posteriores descartan la revisión. Fechas/tarifa requieren precio explícito y nueva comprobación de disponibilidad/capacidad/cotización. Una edición sólo de metadata omite pricing y conserva exactamente los importes, ítems y moneda vigentes. No se amplía la edición a IN_PROGRESS/estados cerrados ni se inventa conversión de moneda.
- PricingRevision es aditiva y auditable; Snapshot, Payment y PaymentApplication históricos permanecen inmutables. La revisión recalcula deuda/crédito sin reembolso automático. Un plan obsoleto, crédito o cobro sin aplicar exige conciliación visible; no se reprograman cuotas ni se reaplican cobros automáticamente, incluso si el total vuelve al original.
- Las operaciones, preview/save, cobros y altas/reemplazos de plan no recuperan ni repiten automáticamente una mutación después de 401. Se descartan respuestas de otro usuario/Business/reserva/rol; un conflicto obliga a consultar nuevamente y revisar. Los pagos conservan la misma clave y payload ante resultado incierto, con CSPRNG nativo o `getRandomValues`; sin CSPRNG se bloquea el POST con mensaje visible. Lecturas y AuthContext conservan su comportamiento existente.
- Se integran las correcciones revisadas de popovers del header y permisos de imágenes. Una URL de lectura S3 previamente firmada puede seguir válida hasta su expiración de una hora después de revocar membresía; no se garantiza revocación instantánea. La creación de Block conserva un límite previo de serialización frente a reservas; no se afirma un lock global común a todos los escritores.

### Validación del conjunto y dependencias del piloto

Estado **Candidato local de aplicación / piloto NO GO**. Aplicación confirmada localmente en `7c481c03313d07a3e88f4f86581dc882d5a5c994`; el fix de precio vigente es `35f2e0b13fa22d8e075c03c6d917081dbd660ec1`. Los gates ejecutaron `50f8dda` más los deltas registrados: la verificación posterior al commit confirma bytes idénticos, sin atribuirles ejecución previa sobre el SHA nuevo. Árbol backend `27268528d77f6da88b8b73a3facae3981090ce86`, frontend `c27833981f84c56a6bc38e4a514cce070faebdbb`. Prisma validate/generate y las 28 migraciones pasaron exclusivamente en PostgreSQL 16 sintético propio, tmpfs, cero mounts y puerto loopback. Backend cerró todos los controles con 696 archivos idénticos antes/después: SHA-256 `fa8b2cf1b29d4f366380e8c57401ac409bc6852513d64bae0804b1600d1c9db2`. El contenedor propio se detuvo/eliminó tras verificar identidad y cero clientes; puerto 55494 libre, servicios ajenos intactos. Evidencia fuera del repositorio: `validation/reservations-pilot-20261002` del workspace de revisión; el mapa documental previo permanece en `validation/documentation-map.md`.

| Control backend del conjunto | Resultado local |
|---|---|
| Lint / build / arquitectura | PASS; cero violaciones, 358 módulos / 853 dependencias |
| Operaciones PostgreSQL/HTTP enfocadas | PASS: 62 pruebas, incluidas las dos regresiones del precio vigente |
| Unitarias completas | PASS: 134 suites / 1611 pruebas |
| Integración PostgreSQL completa | PASS: 37 suites / 287 pruebas |
| E2E independiente completo | PASS: 29 suites / 477 pruebas |
| Aceptación | PASS: 196 escenarios / 777 pasos |
| Cobertura conjunta | PASS: 200 suites / 2375 pruebas; sentencias 96,26 %, ramas 89,16 %, funciones 97,52 %, líneas 97,93 %. Repite las pruebas Jest anteriores; no sumar como casos nuevos. |

Frontend lint/build del primer freeze PASS, con el warning previo de DashboardHeader. El intento completo inicial obtuvo 118 archivos / 1010 pruebas PASS, pero FAIL global por un error de arranque de worker que dejó `AvailabilityCalendarPage.test.tsx` NOT RUN. Se conserva sin convertirlo en PASS; el archivo focalizado posterior obtuvo 42/42 PASS, sin cambios de aplicación, assertions o timeouts. QA de ese bundle completó 92 casos únicos PASS por composición: primer intento 79 PASS/13 FAIL, reintentos de selectores y foco preservados; ningún intento completo verde. Cero peticiones desconocidas/externas, errores JS o overflow; capturas móviles/desktop inspeccionadas y preview propio cerrado.

La QA descubrió un defecto UI adicional: cuotas históricas conservaban Pagar activo con saldo vigente cero/crédito, aunque el guard de submit impedía un cobro. Corregido localmente copiando el disabled del CTA global y bloqueando openPayment con saldo vigente <= 0; no cambia cuotas, pagos, estado ni cobros con saldo positivo y plan pendiente de conciliación. Regresión añade CONFIRMED al caso de crédito NO_SHOW. Ciclo r2 cerró lint/build PASS, 28/28 pruebas focalizadas y suite completa 119 archivos/1053 pruebas PASS; producción/bundle y 122 archivos de pruebas/soporte sin cambios. Su primer build FAIL TS2769 se conserva: opción de selector no admitida corregida a regex exacta, sin bajar comprobaciones. Evidencia separada en `validation/reservations-pilot-20261002/frontend-final-r2`; no se ejecutó QA del bundle r2 porque apareció el bloqueo financiero siguiente.

La revisión encontró además un replay financiero preexistente: apiRequest podía repetir POST/PUT de cobro/plan tras 401 con el token de otra sesión, antes del guard de pantalla. Tres regresiones API ejecutadas antes del fix fallaron por dos fetch en vez de uno (registro, creación y reemplazo de plan). Se conserva esa reproducción controlada; no es una mutación real en PostgreSQL. Corregido localmente con skipUnauthorizedRecovery:true en las dos funciones financieras, sin cambiar AuthContext, lecturas, claves o payloads. Ciclo r3 cerrado: focal 3/3 PASS, lint/build PASS y suite completa **120 archivos / 1056 pruebas PASS** en 664,36 s. Producción 272 archivos SHA-256 `a6763319e2c1ee223e06ef3281723dd8f0f353487a1e46db68d3640543cf95e7`; bundle 147 archivos `37f9f1018da7d906023c2eefe7386030eb93212f5b7eae6eaed4fa4373b32780`; pruebas/soporte 123 archivos `6cfa337c2ad67cb1d9dc2de2c26e28d558826734e1019b27ea621d3e4ed5e3f0`. Todos permanecieron idénticos durante sus controles y después del commit; los freezes anteriores no acreditan este delta. Evidencia: `validation/reservations-pilot-20261002/frontend-final-r3` y `application-commit-check.json`.

QA del bundle r3 cerrada: **98 casos únicos PASS por composición**, sin un intento completo verde. El intento completo conserva **96/98 PASS y 2 FAIL**, ambos de creación de plan 401 en móvil/escritorio antes del POST: el selector exacto del runner omitía el sufijo % del label. Se corrigió sólo el selector, conservando las assertions; el reintento focal obtuvo **2/2 PASS** y no repitió los 96 válidos. Consolidado: 1090 peticiones mock seleccionadas, 1104 contando ambos intentos, cero peticiones desconocidas/externas, errores JS, console inesperada u overflow en los 98 casos seleccionados. Fuentes/bundle y runner estables dentro de cada intento; el hash del runner cambia entre ellos exclusivamente por el selector corregido. Navegadores y previews propios cerrados a las 21:04 y 21:24 UTC tras verificar PID/inicio/ejecutable/argumentos; puerto 4267 libre. Evidencia: `browser-consolidated-final-r3.json` y ambos cleanup separados.

La revisión estática independiente de los ocho archivos de aplicación/pruebas y contratos actualizados no halló blockers concretos. La inspección visual conserva una observación menor: Pagar histórico está disabled y no abre modal ni envía POST con crédito/saldo cero, pero mantiene apariencia verde; no se declara perfección visual ni se modifica de nuevo el bundle validado.

Runtime de estos controles Node 24.19; **Node 22 / CI del SHA final NOT RUN**. LAN documenta runtime Node 22 para otro árbol/candidato, cuya evidencia no acredita este conjunto. No se cambian timeouts, thresholds o assertions para obtener aprobación; se conservan intentos fallidos. QA de navegador utiliza fixtures API estrictos y no acredita persistencia, MinIO real o LAN física. Los controles PostgreSQL/HTTP del backend se distinguen de esos mocks.

El candidato LAN externo de 56 archivos y los nuevos cambios externos de Settings/Business no se importan como un patch sin revisión. La revisión LAN mantiene **CHANGES REQUIRED / ReleaseApproved=false**: cierre seguro del PATCH legacy de correo mediante 409 `EMAIL_CHANGE_UNAVAILABLE`, SELF/ACTIVE y cero mutaciones/tokens; controles completos sobre su SHA final; MinIO real, restauración/permisos y rol PostgreSQL de mínimo privilegio pendientes. Las rutas y la API compartida deben conservar la redirección a Calendar y la opción de no recuperar/repetir mutaciones tras 401 al integrar esas dependencias.

La política pública `/cookies` conserva el inventario basado en la implementación. Proveedores, retención, responsable/contacto/jurisdicción y revisión jurídica siguen pendientes; no se afirma cumplimiento legal. No se alteran cookies, Bearer auth, CORS, firewall, credenciales o trust para superar los controles. Sin push, merge, aprobación de PR o despliegue de este candidato.

## Validación posterior del paquete — 2026-10-01

Smoke con bootstrap normal ejecutado entre 2026-10-01T13:26:46.7709064Z y 2026-10-01T13:27:54.9700346Z, Node 24.19.0/PowerShell 7.6.5, PG nuevo sintético y app HEAD 9c2e8e6cffd36024881c8be6720f132bbd8d7cc4. Seis HTTP200 reales (health/UI/login/perfil/siete Bookings/dos Resources), assertions y cierre de API/frontend/PG propios PASS; 3047/4177/55473 libres. No se repitieron las suites completas ni se instaló nada. Backend55a2290/frontend94633656 limpios e idénticos.

El primer intento falló por readiness. El segundo realizó los controles funcionales y cleanup, pero el recolector falló al escribir result.json por archivo ocupado; ambos resultados originales se preservan. Se distinguen functionalSmokeStatus=PASS y reportingStatus=FAILED_FILE_OCCUPIED_ORIGINAL_PRESERVED. No declarar que el runner completo pasó sin errores. No se repitió el smoke por el fallo del recolector.

Start-QA usa ReadyTimeoutSeconds=180, rango10..300 y detección de salida propia; solo cambió soporte. La causa del primer timeout no quedó probada. Node22/PowerShell5.1 runtime y un recorrido nuevo de navegador siguen pendientes. La API normal puede escuchar fuera de loopback; rigen la máquina QA dedicada y red restringida del README.

Evidencia y proceso públicos en https://github.com/Manuetg/TOP-Platform/blob/codex/night-integration-20261001/docs/16-Portable-QA-Startup.md; PR101 conserva CI por head exacto.

[Evidencia de arranque](16-Portable-QA-Startup.md). La publicación posterior de este soporte requiere CI del head nuevo; consultar PR101.

## Publicación y soporte QA — actualización documental 2026-10-01

[PR #101](https://github.com/Manuetg/TOP-Platform/pull/101) publicada como Draft hacia develop, rama codex/night-integration-20261001, por autorización del usuario a las 12:06 UTC. Sin reviewers, aprobación, merge/auto-merge ni deploy. El código validado ee038ce y sus árboles backend/frontend se conservan.

CI verificado a las 12:27 UTC sobre 6e572c1: [frontend SUCCESS](https://github.com/Manuetg/TOP-Platform/actions/runs/36861110999), 106 archivos/867 pruebas; [backend SUCCESS](https://github.com/Manuetg/TOP-Platform/actions/runs/36861110824), unitarias/integración/E2E/aceptación/cobertura/arquitectura, Node 22.23.3/npm 10.9.9. Mutation SKIPPED por política del evento pull_request; no es PASS. Cualquier head posterior requiere CI propio; consultar la PR.

[Guía detallada](15-Night-Refinement-Review.md) y [soporte QA portable](../scripts/qa/README.md). El paquete parametriza rutas y arranca main.js normal; solo tiene análisis sintáctico, sin smoke nuevo. No contiene .env, datos reales, node_modules ni harness privado. Los apartados inferiores son evidencia histórica del corte local previo a la publicación. Los refinamientos permanecen In Progress, sujetos a revisión humana y gates preproducción.

## Handoff local — corte previo a la publicación

Base verificada: `develop@835b2a4397bb3e6f04480386e62b11c86a74e8a5`. PR #98 integrada el 30/09/2026 en `26ba478`; PR #100 integrada el 01/10/2026 e incluye sidebar, detalle de Resources, agenda mensual y showcase. Los handoffs inferiores son antecedentes fechados. El primer corte de B está integrado; B restante, el quality gate preproducción y la definición comercial de FE-SUB-001 siguen pendientes.

Encargo autorizado para implementación y commits locales en worktrees aislados, con documentación revisada antes de los cambios. Checkout principal `C:\Users\Sady\workspace\TOP-Platform`; integración `C:\Users\Sady\Documents\Codex\2026-09-30\task-2\TOP-Integration`, rama `codex/night-integration-20261001`. Reconsultas remotas solo lectura a las 04:58, 06:22 y 07:02 UTC: develop sigue en `835b2a4`, checkout principal limpio. Sin push, aprobación de review de PR, merge/auto-merge ni despliegue. Las autorizaciones de otros proyectos no aplican.

El mapa externo `validation/documentation-map.md` inventaría los 32 Markdown propios y 11 contratos backend revisados por el integrador, su vigencia, contradicciones, partición, ownership y criterios de aceptación. Router, layout, AuthContext, UI compartida y documentos tienen un único integrador. Se aplicaron paquetes con manifiestos/hashes y commits locales. Plus Jakarta Sans, Lucide regular, Bosque y arcilla y los componentes/tokens existentes se conservan.

### Comportamiento integrado

- Booking conserva siete códigos y sus transiciones/historial: DRAFT/Borrador, PENDING/Pendiente, CONFIRMED/Confirmada, IN_PROGRESS/En curso, COMPLETED/Finalizada, CANCELLED/Cancelada y NO_SHOW/No show. Listas, detalles, pagos, búsqueda, Dashboard y agendas comparten las etiquetas; los estados de Block, Resource, Rate Plan y finanzas conservan sus contratos propios.
- Configuración separa la cuenta personal del Business. SELF ACTIVE puede modificar únicamente nombre, con motivo real y versión canónica exacta; autorización/estado/versión se vuelven a comprobar bajo bloqueo de User. Cambio y auditoría BR-056/BR-063 son atómicos, versión avanza monotónicamente; no-op vigente no escribe y versión obsoleta devuelve 409 antes del no-op. Nombre inmediato en navegación, refresh y storage protegidos frente a respuestas de una sesión anterior. Cambiar Business desde Settings conserva nombre/motivo sin guardar.
- Correo permanece informativo. IAM-005 conserva sesiones por decisión aprobada, pero mantiene `emailVerifiedAt` y los tokens de verificación están vinculados a User sin congelar el email. Re-verificación, re-autenticación y vinculación del token requieren contrato antes de una nueva UI de cambio de correo.
- Resources refina el detalle de PR #100: nombre/descripción largos, capacidad/amenities, fotos con carga/error/vacío separados, galería y permisos. Editar descarta respuestas de otro contexto y conserva campos modificados durante refetch. La agenda mensual muestra movimientos y remite a Availability; no promete disponibilidad autoritativa.
- Ruta pública `/cookies`, enlaces desde login/cuenta e inventario de `top.auth.session.v1`, `top.auth.reset-grant.v1` y `top.sidebar.collapsed.v1`. No se encontró escritura propia de cookies ni SDK de tracking en aplicación. Hosting/proveedores reales, responsable/contacto/jurisdicción/retención y validación jurídica siguen pendientes; no se inventa consentimiento ni se afirma cumplimiento legal.

La revisión estática independiente cerró la pérdida del borrador por el selector real de Business. La QA HTTP con API/PG propios encontró además un defecto del contrato aprobado BKG-003: Swagger sin metadata de validación hacía que la whitelist eliminara `status`, `contactId` y `resourceId`. `@IsOptional()` conserva los tres filtros; validadores de dominio, permisos tenant, intersección y orden existentes se mantienen. No se redefine el contrato ni se interpreta una historia frontend como autorización para otro backend. Hay 21 regresiones HTTP adicionales; el fixture antiguo devolvía siempre la misma reserva y no detectaba el defecto.

### Evidencia local del refinamiento

Fuente congelada: `ee038ce9e94b8f8c7d0b61f9f5cd4fc61f8b9d9c`; árbol backend `55a2290d933a810bd1c60249738d6c204a5d2df6`, frontend `94633656e5d5010c24c75300171377aa4aca75e7`. La documentación se confirma posteriormente sin cambiar esos árboles de aplicación. Runtime local Node 24.19.0; backend npm 9.8.1, frontend npm 10.2.0. CI oficial Node 22 NOT RUN; no se afirma equivalencia de entornos.

| Control | Resultado de este conjunto local |
|---|---|
| Prisma generate / identidad de DB / validate / migrate deploy | PASS; PostgreSQL 16.15 desechable propio, 26 migraciones. Tabla aditiva UserDisplayNameAudit; sin datos/servicios existentes. |
| Backend build / lint | PASS |
| Backend unitarias | PASS: 128 suites / 1464 pruebas |
| Backend integración PostgreSQL | PASS: 34 suites / 199 pruebas, incluidas versión, rollback y deshabilitación concurrente del perfil |
| Backend E2E | PASS: 25 suites / 397 pruebas |
| Aceptación | PASS: 196 escenarios / 777 pasos |
| Cobertura conjunta backend | PASS: 187 suites / 2060 pruebas; sentencias 96,59%, ramas 90,77%, funciones 96,95%, líneas 97,66%. Repite las pruebas Jest anteriores; no sumar como pruebas distintas. |
| Arquitectura | PASS: cero violaciones, 334 módulos / 761 dependencias |
| Frontend build / lint / suite completa | PASS: 106 archivos / 867 pruebas, 457,22 s, tras la corrección CSS. Un warning previo de import sin uso en DashboardHeader. |
| HTTP BKG-003 autenticado posterior al fix | PASS: 28/28 casos sobre API/PG propios; siete filtros de estado, Contact/Resource, intersección, referencias de otro Business vacías, inválidos/vacíos/repetidos 400 y orden estable. Bookings sin cambios. |
| Navegador preview, mocks y API real | PASS: 90 casos; tres SKIPPED de refetch completados en dev. 625 elementos medidos, cero violaciones geométricas; seis restauraciones de nombre/recurso PASS. |
| Regresiones transversales y suplemento dev | PASS: 24/24 y 9/9 fallas originales cerradas; suplemento dev 3/3 PASS. Total 117 casos únicos: 6 públicos, 27 API/PG reales y 84 mocks. |
| CI Node 22 / mutation / cloud / revisión jurídica | NOT RUN en este corte local |

Backend final ejecutado sobre a39c4fd, árbol idéntico al nuevo candidato ee038ce (único delta de aplicación: CSS frontend): `validation/backend-setup/gates-20261001T054631671Z/`, 12/12 PASS, HEAD/árbol estables, logs/resultados/cobertura preservados. El corte anterior `16c15b0` obtuvo 11/12 PASS con lint FAIL por un salto de línea de `it.each`; `a39c4fd` cambia solo ese formato de prueba y repite los 12 controles completos. No se cambiaron timeouts, thresholds, aislamiento ni exclusiones.

Frontend final: validation/frontend-gates-20261001T061701790Z-d7a6d9d3/, build/lint/test e integridad PASS, fuente ee038ce, árbol `94633656e5d5010c24c75300171377aa4aca75e7` y SHA-256 aceb39a5b290884cdf7fde4fd0c0c89f6de9e2ff56ccef875a1a4b53af329d01 idénticos antes/después. El PASS anterior de 106 archivos/867 pruebas en d1a30a4/e26 es un antecedente conservado. El primer wrapper quedó BLOCKED por Tee-Object -LiteralPath -Append y dejó Vitest activo; se corrigió, se cerraron exclusivamente los procesos propios verificados y el segundo intento se canceló. Los intentos se preservan; ambas corridas completas comenzaron sin procesos de tests propios y fueron seriales.

La primera QA parcial de `d1a30a4` se canceló con 38 casos observados, 22 PASS/16 FAIL. Se conserva íntegra: un guard del fixture mock comparaba dos null y simulaba errores normales; una aserción contaba DOM móvil/desktop oculto; la observación HTTP de los filtros sí descubrió el defecto BKG-003 real. El runner corregido exige request, respuesta y una sola fila/badge visible, y captura viewport/scroll además de fullPage para distinguir artefactos de cabeceras fijas. La corrida a39c4fd registró 90 PASS/3 SKIPPED y seis restauraciones de nombre/recurso PASS, con HEAD/runner estables; la inspección manual encontró filtros fuera del panel y Estado recortado en 1024, aunque overflow global pasaba. ee038ce adapta filtros al ancho útil y reutiliza las tarjetas existentes mediante container queries; no cambia JavaScript ni contratos. El runner nuevo midió límites locales del panel y del badge en la recaptura final, sin violaciones. La regresión transversal anterior obtuvo 22 PASS/2 FAIL por un locator ambiguo de Pendiente; ambos Submit registraron exactamente un POST. Se conserva esa evidencia; el locator se acotó al badge y la nueva corrida final obtuvo 24/24 PASS, sin convertir el FAIL anterior en PASS.

Diagnóstico HTTP posterior: `validation/booking-filter-contract/post-fix-20261001T055933878Z/result.json`, 28/28 PASS, HEAD/árbol estables. Solo login de OWNER ficticio y GET; tokens/credenciales omitidos. Ocho consultas anteriores comparadas explícitamente; la relectura final acredita las siete Bookings sin mutaciones. El harness usa AppModule/configureApplication, guards/pipes y PostgreSQL reales; no sustituye el bootstrap productivo ni prueba servicios cloud.

La revisión estática entre agentes no es aprobación de PR ni revisión PM/TL. Los nuevos refinamientos siguen **In Progress local**, sin declaración Completed ni Production Ready. Pendientes: correo seguro, datos legales/proveedores/retención, decisión comercial FE-SUB-001, CI/mutation/quality gate preproducción y revisión humana. Contradicciones históricas preservadas: ADR-001 precede a Phase 2; Block FINISHED frente a COMPLETED antiguo; Rate Plan ACTIVE/ARCHIVED; IDs BR repetidos; conteo frontend 50 filas Completed frente al total 51; Inter provisional sustituido por Brand Book/DESIGN. No se migraron ni reinterpretaron estados históricos.

QA final externa: `validation/visual-qa/runs/final-preview-ee038ce/`, `validation/transversal-regression/runs/final-ee038ce-r2/` y `validation/visual-qa/runs/final-dev-refetch-ee038ce-r3/`. Headless Edge 154.0.4258.37; viewports 390×844, 1024×900 y 1440×900, ejecutados serialmente. HEAD/árbol y runner estables en cada corrida. La inspección manual de capturas representativas confirma la corrección de filtros/Estado en tablet y conserva móvil/desktop. Los avisos de consola corresponden a fixtures previstos de 401/403/500 y ausencia de plan 404; cero errores JavaScript, endpoints desconocidos u orígenes bloqueados. No acredita touch físico ni certificación WCAG completa.

El primer suplemento dev falló antes de login/refetch porque el glob de mocks interceptaba módulos frontend cuyo path contiene `/api/`; los tres FAIL se conservan. El runner limita la API al origen 3047 y prefix `/api/`, permite los módulos frontend y mantiene desconocidos/otros orígenes como errores. La segunda corrida mantuvo tres FAIL por el locator exacto de Código interno, cuya etiqueta incluye ayuda; se corrigió únicamente el selector al input de ese campo, conservando el valor exacto esperado. La tercera corrida 3/3 PASS completa exactamente los tres SKIPPED del preview; no cambió la aplicación, assertions ni timeouts. Los SHA distintos de runners se registran por corrida. Pagos/mutaciones financieras, fotos 1/10 y refetch controlado son mocks; no prueban persistencia financiera, S3/cloud ni cumplimiento jurídico.

Cierre de QA a las 07:07 UTC: navegadores y suites finalizados; API y frontend propios detenidos, PostgreSQL propio desechable detenido y eliminado automáticamente, puertos 3047/4177/55473 libres. Identidad/PID/args y contenedor exactos verificados; servicios ajenos sin cambios. Relectura final confirmó cuatro nombres y dos Resources restaurados, y siete Bookings intactas. Evidencia: `validation/backend-setup/cleanup-final-ee038ce9.json` y `final-db-restoration-ee038ce9.json`. Solo los siete documentos del proyecto se modificaron después de congelar la aplicación; su verificación registra UTF-8, enlaces, diff y preservación íntegra del handoff histórico.

## Handoff histórico — primer corte B: arranque y configuración segura

Baseline y `origin/develop` verificados: `7737b2bbda04ee2a9f2a97585e4a0c672f295a43`. [PR #97](https://github.com/Manuetg/TOP-Platform/pull/97) integrada el 30/09/2026; ninguna PR abierta ni merge posterior al iniciar. Rama `codex/production-startup-hardening`; [PR #98](https://github.com/Manuetg/TOP-Platform/pull/98) abierta contra develop, con implementación y documentación completas en esa misma PR. Publicación autorizada por el usuario el 30/09/2026; commit de implementación `24022215daa49eca0c7d76155b76c23efd56fcb7`. El feature HEAD final y los runs oficiales de cada SHA están en el cuerpo de PR #98, que se actualiza tras los checks; ningún CI de un HEAD anterior acredita el HEAD final. No hay merge ni deploy autorizado.

POST-B-STARTUP cubre B3, B4, B6 y configuración/empaquetado de B2. Valida configuración antes de HTTP; producción exige secretos JWT/OTP independientes, URL pública/CORS HTTPS, SMTP con TLS y storage S3 completo. Swagger no se genera ni registra. Desarrollo/test conservan defaults, console y memoria sin bucket; Compose declara development. `.env` retirado del índice preservando archivo local; revisión sin reproducir valores encontró configuración local, sin indicios de credencial real. Imagen/ignore excluyen env y credenciales. Matriz de variables en [README backend](../backend/README.md).

Estado: **In Progress, corrección de la revisión CHANGES REQUIRED implementada; gates y smoke finales completos, PR #98 abierta para re-revisión PM/TL**. Resultados y runs de Backend CI y Frontend CI por SHA publicado en el cuerpo de [PR #98](https://github.com/Manuetg/TOP-Platform/pull/98); ambos deben aprobar el HEAD final antes de integrar. Mutation local de este corte: **NOT RUN**, diferido al quality gate preproducción según política; no equivale a PASS. El workflow pull_request omite mutation (**SKIPPED**, nunca PASS). La self-review y revisión técnica entre agentes no reemplazan la re-revisión independiente PM/TL. No hay cambios frontend, reglas comerciales, schema, migraciones nuevas ni infraestructura cloud; no se ejecutaron migraciones sobre datos existentes. No hubo merge ni deploy. Épico B sigue abierto y MVP histórico 53/53 permanece intacto.

Revisión recibida en el chat el 30/09/2026: **CHANGES REQUIRED**, finding MEDIUM por cuatro TTL que admitían `Number.MAX_SAFE_INTEGER` y producían Invalid Date. Corregido en `environment.ts`: conversión a milisegundos enteros seguros, suma con el instante de validación dentro de Date/TimeClip y DateTime del motor Prisma vigente (año hasta 9999). Este último límite se verificó adicionalmente mediante SELECT parametrizado sobre PostgreSQL tmpfs propio, sin escrituras: fin de 9999 hace roundtrip y año 10000, aunque válido para JavaScript, es rechazado por Prisma 6.19.3. Los cuatro servicios reales conservan defaults/contratos y las pruebas cubren frontera, siguiente segundo y rechazo del valor reproducido antes de Prisma/listen. README y Architecture precisan que el guard del artefacto Prisma corresponde al bootstrap HTTP por defecto, sin extender la garantía a CLI/imports directos. Corrección preparada para re-revisión; no se emite READY_TO_MERGE sin CI del HEAD publicado y revisión humana.

### Evidencia local final de POST-B-STARTUP (30/09/2026)

Ejecutada tras la corrección TTL sobre el código final en Node **22.23.3**, con PostgreSQL 16 en tmpfs, red/contenedores propios, sin puertos publicados ni volúmenes persistentes. Se aplicaron exclusivamente las 25 migraciones vigentes a la base desechable `top_test`. Las corridas anteriores (incluida la parcial Date/Number con fallo de complejidad lint, corregido mediante helper) se conservan solo como historia, no como gates finales. No se eliminaron pruebas, redujeron umbrales ni ampliaron timeouts.

| Gate | Resultado / evidencia |
|---|---|
| Build y lint backend | PASS |
| Unitarias | PASS: 126 suites / 1397 pruebas |
| Integración PostgreSQL | PASS: 34 suites / 186 pruebas |
| E2E | PASS: 24 suites / 314 pruebas, incluidas 27 de arranque/CORS/Swagger |
| Aceptación | PASS: 196 escenarios / 777 pasos; proceso aislado NODE_ENV=test |
| Cobertura conjunta | PASS: 184 suites / 1897 pruebas; sentencias 96,53%, ramas 90,59%, funciones 96,91%, líneas 97,61% |
| Arquitectura | PASS: 328 módulos / 748 dependencias, sin violaciones |
| Prisma validate | PASS; sin cambios de schema/migraciones |
| Configuración y artefacto Prisma | PASS: 145 pruebas focales incluidas en unitarias; ausencia/vacío/placeholder/formato, bytes, independencia, fronteras TTL con consumidores reales y errores sin valores |
| Build Docker y smoke final tras TTL | PASS: Node production por defecto, 24 fixtures sensibles fuera del filesystem/capas OCI, `.env` físico no utilizado, logs sin markers; los cuatro TTL MAX_SAFE_INTEGER abortan antes de listen directamente en imagen final |
| HTTP/adaptadores/desarrollo | PASS: CORS exacto/ajeno/preflight/sin Origin y guards; Swagger UI/JSON/YAML ausentes en producción con guards desactivados (404 y spies), presentes en desarrollo/test; SMTP TLS/pareja/console, S3 persistente/MinIO/upload/delete/firma real offline. Smoke development sin SMTP y con memoria; Compose config conserva bucket/volúmenes |
| git diff --check | PASS (working tree e índice) |
| Backend CI / Frontend CI del corte | SHA, resultados y runs oficiales del HEAD final en el cuerpo de [PR #98](https://github.com/Manuetg/TOP-Platform/pull/98); ambos SUCCESS requeridos antes de integración |
| Mutation del corte | Local NOT RUN; job pull_request SKIPPED según workflow; diferido al quality gate preproducción, nunca PASS |

Logs, estado, cobertura y probe Prisma finales de la corrección en `backend/reports/production-startup-gates/ttl-review/`, ignorados por Git/Docker. El snapshot final de 605 archivos src/test/scripts/package.json se copió el `2026-09-30T19:25:47.720Z`, después del último ajuste de código/pruebas; SHA256 agregado `323ba50f88437f7b15163f05437dcbe9f2e6c64eb8c65357afaf7b0edd5dedb1`. Las verificaciones before-gates, after-gates, after-image-build y el manifest de la imagen acreditan hashes idénticos del checkout, runner e imagen final, y cada gate registra ese hash. La imagen de dependencias recibió exclusivamente esos archivos, nunca `.env`. Esta evidencia mejora la trazabilidad local y no valida un commit publicado. El snapshot/evidencia anteriores quedan como historia bajo `backend/reports/production-startup-gates/`, incluida la imagen previa `top-production-startup-smoke:d82e9be848934f71a6ed6239f345e7b2`.

Imagen final tras TTL: `top-production-startup-smoke:1eca144cd318427fbc950bbb4e8b147c`, digest `sha256:4bf6c9a7bcd88998970891ef33d4da03b00a179f0bf9a73fbd266161bef2d2de`. Build/smoke completo PASS, más los cuatro rechazos TTL reales; evidencia `smoke-final.log`, `image-ttl-range.log` y verificación de los 605 archivos dentro de la imagen en el mismo directorio ttl-review. Contenedores, PostgreSQL tmpfs y redes propios eliminados; imágenes y evidencia conservadas. `.env` local preservado e ignorado. No se enviaron correos reales ni se conectó a storage/cloud.

La revisión técnica inicial corrigió tres hallazgos: autoload `.env` de Prisma local (snapshot/prevalidación y guard del artefacto antes del import), origins con paths/formato normalizados y múltiples remitentes SMTP. La imagen real de Prisma omite `schemaEnvPath` cuando está ausente: el guard acepta ausencia/null y rechaza rutas o metadatos desconocidos. La regresión default-bootstrap HTTP con configuración completa y autoload simulado acredita rechazo antes de importar Prisma o leer `.env`. La re-revisión PM/TL del ajuste TTL sigue pendiente.

PR #97: feature HEAD `c57d6e48ce02159c6e30731ce4ad0978ad7db8c7`, merge `7737b2b`. [Backend CI 36380678728](https://github.com/Manuetg/TOP-Platform/actions/runs/36380678728) y [Frontend CI 36380678777](https://github.com/Manuetg/TOP-Platform/actions/runs/36380678777) SUCCESS; mutation SKIPPED. El encargo informa revisión PM/TL **APPROVE WITH NOTES — READY_TO_MERGE**; la consulta GitHub no devolvió reviews formales ni comentarios, por lo que se distingue esa evidencia suministrada de un registro formal de GitHub. Se conservan debajo sus resultados locales y límites de QA; no se reutilizan como validación de POST-B-STARTUP.

### Archivos del primer corte B

- Configuración/arranque: `backend/src/main.ts`, `src/app.module.ts`, `src/config/configure-application.ts`, nuevos `src/config/bootstrap.ts`, `environment.ts`, `environment.spec.ts`, `prisma-environment.ts` y `prisma-environment.spec.ts` (rutas `src` relativas a backend).
- Persistencia: `backend/src/modules/business/infrastructure/prisma.service.ts` y `identity/infrastructure/prisma-identity.service.ts`.
- Correo/identidad: `backend/src/modules/identity/identity.module.ts`, nuevo `identity.module.spec.ts`; `infrastructure/smtp-email-sender.ts` y nuevo spec; `infrastructure/crypto-password-reset-otp.service.ts` y spec; `application/signup.use-case.ts` y spec; `application/resend-verification.use-case.ts` y spec. Las rutas internas corresponden al mismo módulo Identity.
- Storage: `backend/src/modules/resource/resource.module.ts` y nuevo spec; `infrastructure/s3-file-storage.ts` y spec.
- E2E: nuevo `backend/test/e2e/production-startup.e2e-spec.ts`; adaptación de `security`, `payment-history`, `outstanding-balance`, `manual-pricing` y `dashboard` E2E para inyectar JWT sin mutar el entorno global.
- Ejecución/paquete: `backend/package.json`, nuevo `scripts/run-acceptance.cjs`, nuevo `test/packaging/production-image.smoke.mjs`, `backend/Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`, nuevo `.gitignore` raíz y retirada del índice de `backend/.env` conservado localmente.
- Documentación existente: `backend/README.md` y `docs/00-Current-Status.md`, `05-Architecture.md`, `06-Roadmap.md`, `07-Backlog.md`. Sin archivos frontend, lockfiles, schema ni migraciones modificados.

Supuestos de compatibilidad: Node 22, PostgreSQL/Prisma y SDK S3 vigentes; producción usa el artefacto limpio del Dockerfile. El guard de metadatos Prisma rechaza clientes generados con autoload env y debe revisarse al actualizar Prisma. No se presume conectividad SMTP/storage por superar validación local; no se probaron envíos reales ni infraestructura cloud.

Decisiones pendientes: re-revisión independiente PM/TL e integración humana de PR #98 tras verificar ambos CI del HEAD publicado, registrados en esa PR. Mutation queda para el quality gate preproducción. El proveedor productivo de correo/storage, B restante y la decisión comercial FE-SUB-001 siguen fuera de este corte. No se declara Production Ready.

## Handoff histórico — precio manual libre / PR #97 antes de su integración

Las referencias a In Progress y revisión pendiente en los párrafos siguientes describen el handoff previo al merge. El estado integrado vigente y la evidencia oficial están arriba.

PR #96 del Épico A está integrada en develop. El baseline de trabajo para esta decisión es `origin/develop@ea0c373ee3c5e9d0bed87dcc0133b330ccdc5a22` (28/09/2026), según el encargo y el checkout de trabajo. Este seguimiento es independiente del Épico B y no cambia los recuentos históricos del MVP.

**Decisión de Producto del 28/09/2026:** precio manual libre para OWNER/ADMIN en Calendar y Confirm Booking con cero, uno o varios tarifarios aplicables. Sustituye la condición de opción C/POST-A7 que exigía ausencia de planes; se conserva como historial debajo y en [Roadmap](06-Roadmap.md). La variante vigente `MANUAL_NO_RATE_PLAN` expresa falta de referencia en el precio registrado, no ausencia de tarifarios en el catálogo. El request declara modo, Resource, importe total acordado y motivo, omite `ratePlanId`; el Snapshot no inventa sugerido, ajuste ni desglose. PYG conserva escala 1:1 y la moneda procede del Business.

La consulta de planes solo condiciona Configurada. Manual conserva edición, foco y valores durante carga, error o refetch del catálogo; cambios reales de identidad, Business, Booking, Resource o fechas invalidan el borrador. Los dos flujos muestran el símbolo de moneda dentro del campo, fuera del valor editable. Se mantienen capability, disponibilidad, tenant, estados activos, fechas, Contact, atomicidad y auditoría; no hay nueva migración ni estado de Booking. Se actualizaron los contratos y las pruebas que imponían referencia o 409 por aparición de planes.

Estado de esta entrega: **In Progress, lista para revisión PM/TL** en `codex/manual-price-free`. Backend: build y lint PASS; unitarias 121 suites/1170 pruebas PASS; integración PostgreSQL y E2E PASS; aceptación 196 escenarios/777 pasos PASS, incluido uno nuevo con AppModule y PostgreSQL reales para confirmar Manual con plan aplicable; cobertura conjunta final 178 suites/1643 pruebas PASS (sentencias 96,19 %, ramas 89,16 %, funciones 96,63 %, líneas 97,24 %); arquitectura 323 módulos/732 dependencias PASS. Prisma validate y migrate status PASS; 25 migraciones vigentes, sin cambios SQL. Frontend: build y lint PASS (un warning previo de import sin uso en DashboardHeader), suite final completa 94 archivos/551 pruebas PASS con un worker. La primera corrida paralela tuvo un timeout aislado de Contact/Calendar; se repitió sin cambiar timeouts y la corrida final sobre código congelado pasó. `git diff --check` PASS.

QA Edge con API y PostgreSQL desechables separados de los datos existentes: Calendar y Confirm Booking en 1440×900 y 390×844. Cuatro confirmaciones iniciales y una posterior al último ajuste devolvieron HTTP 200 con plan aplicable y Booking final CONFIRMED. Los cinco requests enviaron `MANUAL_NO_RATE_PLAN`, `agreedAmountMinor: 450000` y motivo explícito sin `ratePlanId`; los cinco Snapshots persistidos conservaron 450000 PYG, dos noches, referencia/sugerido/ajuste nulos y desglose vacío. Prefijo ₲, foco, teclado, entrada inválida/cero y ausencia de overflow verificados en ambos flujos; el smoke final no registró errores de página. En navegador se interceptó solo el GET de tarifarios para simular 503 y un refetch demorado: Configurada bloqueó avance, Manual conservó valor y foco, sin POST espontáneo. Es prueba de UI con respuesta controlada; las cinco confirmaciones y lecturas de Snapshot sí usaron API/DB reales de prueba. Capturas y payloads fuera del repositorio. El 404 aislado de `/favicon.ico` del Vite de desarrollo no afectó API ni flujos. El enlace de salto visto en una captura `fullPage` quedó fuera del viewport real, con foco correcto en el diálogo.

Pendiente de cierre: revisión independiente PM/TL. Los resultados de Frontend CI y Backend CI de cada HEAD publicado se consultan en el PR de esta rama; la evidencia anterior describe las verificaciones locales. Mutation: **SKIPPED** por el workflow del PR, no se presenta como PASS. Ninguna evidencia de PR #96 se usa como validación de esta modificación.

## Handoff histórico — Épico A / PR #96 antes de su integración

Los párrafos siguientes registran el proceso y la opción C del 24/09/2026. Sus afirmaciones sobre PR abierta, ausencia de QA y rechazo al aparecer planes describen ese estado anterior y no son reglas vigentes.

Baseline remoto verificado: `develop@cb9eddcb5eb9fcd55008555a29bb478d71f6009a`, PR #90–95 integradas y ninguna PR abierta al iniciar. Checkout local limpio; rama `post-mvp/ux-functional-refinement` creada desde origin/develop. El handoff siguiente se conserva como historial, no como estado actual de esas PR.

Épico A: implementación y gates completos; **Completed preparado, efectivo al merge de [PR #96](https://github.com/Manuetg/TOP-Platform/pull/96)**. Hasta ese merge sigue sin integrar en develop. B/C/D: Planned. E: Discovery. Roadmap completo en [06-Roadmap.md](06-Roadmap.md). Backend MVP permanece **53/53 Completed**; recuento frontend histórico intacto. No se declara Product Ready ni Production Ready; decisión comercial de FE-SUB-001 sigue pendiente antes de producción.

Gaps del baseline resueltos: fechas de presentación inconsistentes, selector Pricing sin estados Foundation completos, teléfonos sin normalización backend, ausencia de archivo explícito Contact, window.confirm en Resources, inputs Booking ad-hoc y modo configurado visible sin planes. OverlayPanel, consulta contextual Rate Plans y permisos backend ya existen.

A7: opción C aprobada el 24/09/2026. Sin planes aplicables, OWNER/ADMIN pueden ingresar precio manual excepcional con motivo; con planes se conserva referencia. Backend revalida elegibilidad y Snapshot identifica MANUAL_NO_RATE_PLAN. A3/A4 y la opción C de A7 son cambios backend post-MVP explícitamente aprobados; su contrato y evidencia se registran en el backlog separado. QA interactiva: NOT RUN por instrucción de esta ejecución. CI propios del nuevo épico: ambos SUCCESS; evidencia debajo.

### Implementación y verificación del Épico A

Implementados A1–A7 en esta rama: helper de fechas puro y formatter de instantes por Business; interacción Foundation en Pricing; teléfono internacional en alta/edición/alta contextual y WhatsApp; archivo Contact auditado; ConfirmDialog en Contact/Resources; inputs Booking; cero tarifas con excepción manual explícita para OWNER/ADMIN, cancelación contextual y permiso de override también en confirmación backend. La API de fechas permanece intacta.

Migración aditiva pendiente de despliegue: `20260924000000_contact_archive_audit`. Sin cambios de infraestructura, sin migraciones sobre datos locales/reales, sin B/C/D/E implementados. `libphonenumber-js/min` se declara explícitamente (ya existía transitivamente en backend), fijada en ambos lockfiles; chunk diferido aproximado 121 kB / 30 kB gzip.

Validación local: lint/build frontend y backend, Prisma validate, arquitectura y diff check PASS. Regresión focal backend: 73 pruebas; E2E Contact/seguridad: 33 PASS. Pruebas PostgreSQL de archivo concurrente, idempotencia, historial y aislamiento aprobadas en CI; aceptación de archivo repetido aprobada. Frontend incluye regresiones de bisiesto/null/instantes, focus trap/retorno, teléfonos históricos, cache/cancelación de archivo y planes cero/uno/varios/error/roles/cambio de contexto. La corrida local completa de frontend aprobó 90 archivos/508 pruebas; la prueba posterior de API y Calendar aprobó 25/25. La suite oficial incluye las 509 pruebas finales. Los resultados oficiales corresponden al código implementado; el HEAD final con este cierre documental y su checkout sintético se verifican y registran en el cuerpo de la misma PR.

Evidencia oficial de implementación: feature HEAD `151ee2b9c818379fd0ba1648030a8dc231ec7d01`, checkout sintético de PR `a06fe60521b987427061f4c10e4dddfcf8059852` sobre el baseline indicado. No confundir el checkout de GitHub con la rama local.

| Gate oficial | Resultado | Evidencia |
|---|---|---|
| Frontend CI | SUCCESS | [Run 36003408977](https://github.com/Manuetg/TOP-Platform/actions/runs/36003408977): build, lint y 91 archivos/509 pruebas PASS. |
| Backend CI | SUCCESS | [Run 36003409058](https://github.com/Manuetg/TOP-Platform/actions/runs/36003409058): 119 suites/1135 unitarias, 34 suites/178 integración PostgreSQL, 22 suites/260 E2E, 195 escenarios/771 pasos de aceptación. Lint, arquitectura, migraciones, Prisma y build PASS. |
| Cobertura backend | PASS | 175 suites/1573 pruebas; statements 96,07%, branches 88,98%, functions 96,27%, lines 97,11%. Sin rebajar gates. |
| Mutation | SKIPPED | Job omitido por política de pull_request; no equivale a PASS. |

Self-review técnica (no independiente) siguiendo top-frontend-review: sin bloqueantes conocidos tras corregir foco del shell, preservación de teléfonos legacy y targets tardíos. QA manual/interactiva móvil/desktop: **NOT RUN** por instrucción expresa; no equivale a certificación visual o WCAG. Mutation: **SKIPPED** en pull_request según workflow vigente, nunca PASS. DoD técnica acreditada por pruebas y ambos CI; cierre documental preparado en la misma PR, efectivo en develop solo tras revisión/merge humano. No hay aprobación independiente ni auto-merge. Siguiente épico previsto: B, sin inicio automático.

### Revisión final de PR #96 — correcciones UX y discovery

Reanudación del 27/09/2026: sincronizada la rama con `origin/develop@5cfbbf9ef127a4e28f6c3685f28af5487ff69222` (Dashboard operativo). Se conserva el nuevo selector mensual y su etiqueta de mes; ya no presenta el antiguo rango de fechas que formateaba A1. Se actualizan también las expectativas de integración del lector de ocupación al contrato ampliado: se conservan todas las comprobaciones de totales, aislamiento/fechas/estados y se verifica el resultado completo vacío y con actividad (serie diaria y fines de semana). La expectativa exacta del login E2E incluye ahora `displayName`, agregado por ese Dashboard, conservando las comprobaciones de datos no expuestos. Las suites oficiales del HEAD final validan esta combinación.

Continuación sobre `f419789876789a83d9a5e456ca1f18438e5fb8e4`, sin cambios remotos posteriores al comenzar. Contact agrupa País/Teléfono/Email y comparte controles entre alta/edición; Calendar reutiliza el teléfono compuesto. Archivo adopta warning terracota en la acción y confirmación, con etiqueta visible móvil. ConfirmDialog agrega backdrop modal al 40%, portal sobre la aplicación y aislamiento inert del fondo; conserva foco, cierre condicionado y reduced-motion. Decisiones visuales acotadas en [Design Context](design/DESIGN.md).

**POST-A7: opción C aprobada e implementada en esta rama (24/09/2026).** Calendar y Confirm Booking aceptan monto/motivo sin Rate Plan cuando la selección contextual no devuelve ninguno y el rol es OWNER/ADMIN. Backend revalida ausencia al preparar confirmación; un plan que pasa a ser aplicable produce 409, sin confirmar ni persistir Snapshot. Se conserva la reserva PENDING para resolverla. Snapshot MANUAL_NO_RATE_PLAN con referencia/sugerido/ajuste nulos, sin tarifa ficticia ni modificación histórica. Misma moneda, disponibilidad, tenant y auditoría. No requiere migración adicional. Comparación y decisión en [Roadmap](06-Roadmap.md).

Validación local de opción C: builds/lint frontend/backend, arquitectura, Prisma y diff check PASS; frontend completo con 91 archivos/524 pruebas, 100 pruebas focalizadas backend, 8 de integración PostgreSQL (incluidos pagos/saldo/Revenue) y aceptación completa de 195 escenarios/771 pasos PASS. Las suites completas de frontend y backend, cobertura y ambos CI del HEAD publicado se registran con sus runs en el cuerpo de PR #96. La cobertura completa local fue interrumpida por consumo de recursos; no se presenta como PASS. QA interactiva NOT RUN según instrucción vigente; mutation según política de PR (SKIPPED, no PASS). Los resultados anteriores de esta sección son históricos de los commits previos a opción C.

Validación local: 10 archivos/90 pruebas focalizadas PASS (orden/prefijo/payload, warning, backdrop/foco/inert/carga y regresión de shell/Resources, incluido retorno de foco cuando el navegador ya lo movió al body), lint/build y diff check PASS. Contraste calculado de texto warning: 5,77:1 en reposo, 5,34:1 en hover y 4,93:1 en pressed; no sustituye QA visual. Los gates oficiales del HEAD final se registran en el cuerpo de la misma PR. Self-review frontend, sin aprobación independiente; QA interactiva **NOT RUN**. La decisión de Pricing queda resuelta por opción C; cambios preparados para revisión PM/TL tras finalizar los gates. PR #96 permanece abierta, sin merge y sin iniciar B.

## Handoff histórico — cierre del MVP por épicos

Baseline `develop@4c866cc` con Payments y Calendar/Pricing mergeados. Implementación en ramas nuevas, sin merge directo ni incorporación de infraestructura local. Las PR están encadenadas y deben revisarse/mergearse en orden:


| Épico | PR / feature HEAD | Evidencia |
|---|---|---|
| Mantenimiento preliminar | #90 / `cca693894b76772902edae973583eb71662423f8` | Frontend CI `35868609248`, Backend CI `35868609614` SUCCESS; Login real desktop/móvil |
| Foundation Polish | #91 / `a6906b0ba1b25807e7a7d7b5a3c47db8d115e1f1` | Frontend CI `35872648453`, Backend CI `35872648438` SUCCESS; QA 1440/1024/390 px |
| Business Management | #92 / `06a6f4c7c62f2e37c1fcbc6a74239ecf3c92c771` | Frontend CI `35875446704`, Backend CI `35875446441` SUCCESS; selector/perfil reales y segundo Business local autorizado |
| Subscription & Entitlements | #93 / `3d101139276c6fa7aab06e090027005de3d4a2cd` | Corrección comercial documental; CI finales del HEAD en #93; enforcement PostgreSQL, QA de 0/8/9/10 y aislamiento |
| Quality gate final | `codex/frontend-quality-gate` | Rutas diferidas (~366 kB), Calendar contextual/cancelable con timezone IANA y escala PYG unificada; HEAD/CI final en cuerpo de su PR |

Subscription conserva una configuración provisional del MVP, pendiente de confirmación comercial antes de producción: TOP Inicial, 10 Resources ACTIVE/OUT_OF_SERVICE; ARCHIVED no consume. Todos los miembros leen capacidad; OWNER registra una solicitud única de ampliación, sin cobro ni cambio automático. Contratos, reglas y operación administrativa documentados en Domain Bible, Business Rules y Architecture.

Quality gate resolvió dos regresiones demostradas: Calendar usaba una variable de demo en vez del Business activo y Pricing/Calendar escalaban PYG por 100 mientras Payments/Dashboard usaban el entero contractual. No se modifican registros financieros históricos ni se recalculan saldos. PYG se muestra/envía como guaraní entero; revisar manualmente cualquier dato introducido con la UI anterior antes de una operación real, sin conversión masiva inferida.

Calendar corrige además Hoy/mes/día comercial con la timezone IANA del Business; Blocks recibe los instantes correspondientes al inicio local y fin exclusivo, preservando fechas puras de Availability. Regresiones deterministas de borde de mes, DST y cambio de contexto; QA interactiva anterior conservada, no repetida. Mutation SKIPPED, no PASS. Los gates finales se ejecutan en GitHub CI y se registran en #93/#94.

Las capacidades internas y su QA se detallan en `docs/14-Frontend-Backlog.md`. El estado efectivo preparado se especifica en «Estado Frontend» y coincide con ese backlog. No se declara merge ni aprobación formal independiente. TOP Inicial / 10 Resources es configuración provisional, no una decisión comercial final. MVP técnicamente integrado no equivale a production readiness: no se declara production-ready ni MVP final cerrado mientras FE-SUB-001 conserve la decisión comercial de nombre/cupo pendiente antes de producción. No habrá PR documental posterior.

QA vigente: Edge 153.0.4234.48, frontend local :3001 y API real :3000/api; desktop 1440×900, tablet 1024×900 (Foundation) y móvil emulado 390×844. Touch físico y cambio real de preferencia de motion del sistema NOT RUN; CSS reduced-motion y regresiones automatizadas acreditadas. No equivale a certificación WCAG completa.

Worktree final: `C:\Users\Sady\workspace\TOP-MVP-Quality`. La ruta Windows es un worktree local, no el checkout sintético de GitHub. Base de QA y archivos ajenos del checkout original preservados. No auto-merge. Las secciones inferiores conservan el historial con sus fechas y no reemplazan este handoff.

## Responsabilidades

### Backend
Responsable: Rolo

Alcance:
- NestJS API
- Prisma / PostgreSQL
- Swagger y contratos API
- Seguridad y autorización backend
- Tests backend
- Migraciones
- Docker backend

### Frontend
Responsable: Emanuel

Alcance:
- React / TypeScript
- UI/UX
- Integración con API
- Routing
- Sesión frontend
- Estados de carga/error
- Diseño responsive/mobile-first

## Estado Backend

Última historia completada:
- DSH-001 — Business Dashboard — Completed

Estado del backlog backend del MVP:
- 53 / 53 capacidades completadas
- 100%

Booking:
- 6 / 6 completadas

Dashboard:
- 4 / 4 completadas (100%)

Capacidad backend actualmente en desarrollo:
- POST-B-STARTUP — primer corte de arranque y configuración segura, separado del MVP; preparado para revisión en rama local.

Siguiente capacidad backend:
- Ninguna dentro del backlog MVP aprobado.

Validación de cambios backend:
- Backend CI en estado `SUCCESS` es obligatorio.
- Mientras `rolandobarros27` sea el único responsable backend, la revisión técnica se registra como `backend self-review documentada`, sin describirla como independiente.
- Una review externa se registra como tal únicamente cuando la realiza una persona con responsabilidad y capacidad técnica real sobre backend; no se aplican waivers automáticos.
- Mutation Testing se difiere al quality gate preproducción por su costo de ejecución; el requisito y sus umbrales permanecen vigentes.

Pendientes principales posteriores:
- Platform Administration / Global Authority pendiente de definición
- quality gate preproducción, incluido Mutation Testing según la decisión vigente

## Estado Frontend

Total historias frontend activas: 52

Estado preparado para integración de la cadena #90 → #91 → #92 → #93 → #94 (no acredita merge ejecutado):

- Completed: 51
- In Progress: 1
- Planned: 0
- Blocked: 0

El único In Progress es FE-SUB-001 — implementación técnica completa; decisión comercial de nombre/cupo pendiente antes de producción.

- Foundation: FE-FND-006/007/008 — Completed — efectivo al integrarse la cadena aprobada en develop.
- Business: FE-BUS-002/003 — Completed — efectivo al integrarse la cadena aprobada en develop.

Recuento efectivo al integrar la cadena: 51 + 1 + 0 + 0 = 52. FE-AVL-002 y FE-PAY-000 son registros históricos excluidos del total activo, como en `docs/14-Frontend-Backlog.md`.

Evidencia histórica de capacidades completadas:
- FE-FND-009 — Completed por merge de [PR #83](https://github.com/Manuetg/TOP-Platform/pull/83), commit `38b8ac0`. La evidencia histórica de integración, reintento controlado, teclado, scroll, cancelación y logout se conserva en el Backlog. Touch real y cambio real de Business/identidad permanecen NOT RUN; Rolo aceptó el riesgo residual para el merge.
- FE-PAY-001 — Completed por merge de [PR #85](https://github.com/Manuetg/TOP-Platform/pull/85), commit `05e6bd6`. Integra saldo e historial de Payments de solo lectura en el detalle de Booking, sobre PAY-003/PAY-004; cubre paginación, refetch, foco, cambios de contexto y logout sin modificar `/app/payments` ni incorporar mutations. Frontend y Backend CI del HEAD final `c766fbc` aprobaron; mutation omitida por política. QA interactiva: NOT RUN por decisión expresa de Rolo.
- Dashboard Business implementado y mergeado en `/app`.
- FE-DSH-001 — Completed.
- FE-BUS-001 — Completed; las siete features tenant-scoped consumen Active Business Context y el ciclo de vida está cubierto por tests.
- FE-FND-004 — Completed preparado, efectivo en `develop` al mergear PR #82. Boundary de contenido bajo ProtectedRoute/BusinessBoundary conserva shell, cuenta, Auth y QueryClient; reintento local y cambio de ruta/identidad/Business recuperan la vista sin reproducir mutations. Respaldo de shell/router y boundary exterior de providers sin dependencias de contexto, con inicio/recarga de documento. FE-FND-003 mantiene errores API locales; no se capturan por sí solos eventos o promesas fuera del árbol React. Frontend CI `35473054747` SUCCESS (Node `v22.23.2`, build, 67 archivos/317 tests, lint); Backend CI `35473054790` SUCCESS. Self-review sin bloqueantes y diff check PASS. HEAD/checkout finales en el cuerpo de la misma PR. QA manual móvil/desktop: NOT RUN; mutation diferida. Backend y trabajo de Manu sin cambios.
- FE-FND-003 — manejo compartido de errores API completo; cierre efectivo al mergear PR #81. Frontend CI `35386101873` aprobó Node `v22.23.2`, build, 64 archivos/296 tests y lint; Backend CI `35386101857` SUCCESS. QA manual: NOT RUN.
- Resources y Rate Plans usan contratos reales; Revenue, Occupancy y Reservations usan el Dashboard backend real.
- Los widgets Dashboard sin contrato backend aprobado fueron retirados del MVP; no se muestran datos ficticios.
- FE-IAM-003 — Session Persistence, FE-IAM-004 — Refresh Token Rotation, FE-IAM-005 — Logout y FE-IAM-006 — Protected Routes están Completed.
- FE-IAM-001 — Login cumple sus criterios funcionales: valida credenciales, establece sesión en éxito, conserva el destino privado seguro mediante `PublicRoute`, presenta loading y errores contractuales, y permite reintentar. Se completó cobertura de validación, envío duplicado, errores, reintento y API en `feature/fe-iam-001-complete-login`; su cierre documental es efectivo en `develop` al mergear esa PR. Frontend CI `35382260589` aprobó el feature HEAD `bd6e6b00e0f0160a3c61641ce322d9428201ffb4` (Node `v22.23.2`, 64 archivos/273 tests, lint y build PASS); Backend CI `35382260648` SUCCESS. QA manual de navegador: `NOT RUN`.
- FE-IAM-005 usa el refresh token vigente, revoca remotamente en best effort, limpia sesión/storage/cache de inmediato y evita que refreshes tardíos restauren la sesión. Validación automatizada Node 22: 59 archivos y 225 tests PASS, lint PASS y build PASS; validación manual de revocación en navegador no ejecutada.
- FE-IAM-006 protege centralmente `/app`, conserva deep links internos seguros, evita contenido privado durante restauración y retira el árbol privado al perder la sesión. La implementación original corresponde a PR #73; PR #79 agrega validación estricta de `next`, elimina la navegación post-login competidora y añade Frontend CI. Evidencia: run `35378595452`, Node `v22.23.2`, build PASS, 63 archivos/261 tests PASS y lint PASS. El cierre queda efectivo al merge; QA manual de navegador permanece `NOT RUN`.
- FE-IAM-003 fue validada con F5, `sessionStorage`, refresh rotatorio y reanudación del Dashboard.
- La quality gate frontend usa Node 22: 59 archivos y 225 tests PASS; `npm run lint` PASS con alcance explícito a `src`, `tests` y `vite.config.ts`; build PASS.
- Los widgets Dashboard sin contrato backend fueron retirados del MVP; no hay mocks operativos visibles.

Siguiente decisión pendiente: confirmar o cambiar el nombre/cupo provisional TOP Inicial / 10 Resources de FE-SUB-001 antes de producción. No hay historias frontend Planned restantes. La integración de la cadena corresponde a un merge humano; el MVP final no se declara cerrado mientras persista esa decisión comercial pendiente.

## Contratos que impactan Frontend

Swagger:
- `/api/docs`

Identity & Access:
- IAM-008 está completada y no agrega endpoint: backend aplica una policy estática Role → Capability con default deny y Membership vigente por Business.
- Los Roles tenant-scoped no autorizan operaciones GLOBAL; Create Business, Create User y Disable User quedan fail-closed hasta definir Platform Authority.
- Cambios de autorización para frontend: RECEPTIONIST pierde mutaciones de Resources, Pricing y Availability Rules; ADMIN pierde Business Archive y asignación de OWNER; VIEWER puede ejecutar el cálculo estándar de Pricing sin efectos.
- `PATCH /api/users/:userId` permite al User `ACTIVE` actualizar únicamente su propio email; el `JWT sub` debe coincidir con `userId`.
- El cambio normaliza el email y conserva password, status, Memberships, Roles y sesiones; otro User recibe `403`, email duplicado `409` y body inválido `400`.
- Login conserva una lista de membresías con `{ businessId, role }`.
- Roles disponibles: `OWNER`, `ADMIN`, `RECEPTIONIST` y `VIEWER`.
- El JWT continúa siendo identity-only: el rol no se congela en claims y backend resuelve la membresía vigente.
- `VIEWER` es read-only; backend permanece como autoridad de autorización.
- IAM-007 no agrega API de Roles ni endpoint para modificar el rol.
- Breaking change: no.

Booking Lifecycle actual:
- `POST /api/businesses/:businessId/bookings`
- `GET /api/businesses/:businessId/bookings`
- `GET /api/businesses/:businessId/bookings/:bookingId`
- `PATCH /api/businesses/:businessId/bookings/:bookingId`
- `POST /api/businesses/:businessId/bookings/:bookingId/submit`
- `POST /api/businesses/:businessId/bookings/:bookingId/confirm`
- `POST /api/businesses/:businessId/bookings/:bookingId/cancel`
- `GET /api/businesses/:businessId/bookings/:bookingId/timeline`

Booking Timeline:
- Auth: `Authorization: Bearer <token>`.
- Path: `businessId`, `bookingId`.
- Query: `cursor?` opaco y `limit?` entre 1 y 50; default 50.
- Response: `items` con `id`, `type`, `occurredAt`, `actor` (`{ userId }` o `null`) y `details`; `pageInfo` contiene `nextCursor` y `hasNextPage`.
- Eventos: `BOOKING_CREATED`, `BOOKING_SUBMITTED`, `BOOKING_CONFIRMED`, `BOOKING_CANCELLED`.
- Cancel admite `reason` opcional en `details`; no existe backfill para Bookings anteriores a BKG-006.
- Breaking change: no.

Payment Plan (PAY-002):
- `POST /api/businesses/:businessId/bookings/:bookingId/payment-plan`
- `GET /api/businesses/:businessId/bookings/:bookingId/payment-plan`
- `PUT /api/businesses/:businessId/bookings/:bookingId/payment-plan`
- El plan usa total y moneda del PricingSnapshot, aplica Payments automáticamente y no modifica Booking ni PricingSnapshot.
- Breaking change: no; agrega endpoints y persistencia.

Outstanding Balance (PAY-004):
- `GET /api/businesses/:businessId/bookings/:bookingId/outstanding-balance`
- Expone por Booking total, pagado, pendiente, vencido, estado financiero y próximo vencimiento derivados; no persiste un segundo saldo mutable.
- Usa `payment.read`, funciona sin PaymentPlan cuando existe PricingSnapshot y conserva lectura histórica tenant-scoped.
- Breaking change: no; agrega un endpoint read-only.

Payment History (PAY-003):
- `GET /api/businesses/:businessId/bookings/:bookingId/payments`
- Usa `payment.read` y devuelve `items` más `pageInfo` con paginación por cursor opaco, límite máximo 50 y los eventos financieros más recientes primero.
- Expone únicamente los campos públicos de Payment, permite lectura histórica y no documenta la estructura interna del cursor como contrato para Frontend.
- Breaking change: no; agrega lectura paginada sobre la colección existente de Payments.

Occupancy KPI (DSH-002):
- La proyección backend interna está completada y se expone mediante DSH-001 — Business Dashboard.
- No agrega endpoint público ni `dashboard.read` en esta historia.

Revenue KPI (DSH-003 — Completed):
- Proyección backend interna de Payments `RECORDED` por `paidAt`, dentro de un período `[from, to)` de hasta 31 días en la timezone del Business.
- Devuelve `currency` y `amountMinor`; no filtra por estado de Booking, no usa PricingSnapshot y no realiza FX.
- No agrega endpoint público propio; DSH-001 la expone mediante `dashboard.read`.
- Breaking change: no.

Reservations KPI (DSH-004 — Completed):
- Proyección backend interna de Bookings creadas por `createdAt` dentro de un período `[from, to)` de hasta 31 días en la timezone del Business.
- Devuelve `total` y los siete estados actuales, incluidos los que tengan valor cero; una Booking multi-resource cuenta una sola vez.
- No usa check-in/check-out, Contact o Timeline para formar la cohorte y no reconstruye estado histórico.
- No agrega endpoint público propio; DSH-001 la expone mediante `dashboard.read`.

Business Dashboard (DSH-001 — Completed):
- `GET /api/businesses/:businessId/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- Compone `occupancy`, `revenue` y `reservations` para el mismo período Business-local `[from, to)` obligatorio de hasta 31 días.
- Usa `dashboard.read`, con scope BUSINESS para `OWNER`, `ADMIN`, `RECEPTIONIST` y `VIEWER`.
- La respuesta es all-or-nothing, permite lectura de Business archivado y no recalcula ni persiste métricas.
- Breaking change: no; agrega el único contrato HTTP público del bloque Dashboard.

Rate Plan Read para integración frontend:
- `GET /api/businesses/:businessId/rate-plans` usa `pricing.read` y devuelve `RatePlanResponseDto[]`.
- Sin filtros entrega el catálogo tenant-scoped, incluidos planes activos y archivados, en orden `name ASC, id ASC`.
- Con `resourceId`, `checkIn` y `checkOut` enviados conjuntamente entrega solo planes activos, asignados y vigentes que backend considera seleccionables para el Resource y la estadía.
- Business archivado permite catálogo histórico, pero el modo de selección exige Business y Resource activos.
- Rate Plan Detail queda diferido; PricingSnapshot permanece interno y Booking Detail no cambia en el MVP.
- Desbloquea FE-PRI-001 y FE-BKG-006. Breaking change: no.

## Regla de coordinación Backend → Frontend

Cuando Backend modifica un contrato que consume Frontend, actualizar esta sección con:

- fecha;
- historia;
- endpoint;
- cambio;
- breaking change: sí/no;
- acción requerida en frontend.

## Cambios recientes relevantes para Frontend

- DSH-001 completado: el contrato backend del Dashboard está disponible con `from` y `to` obligatorios, respuesta `occupancy + revenue + reservations` y capability `dashboard.read`; no requiere cambios de semántica en los KPI internos ni completa por sí mismo el trabajo frontend.
- DSH-004 finalizado: existe la proyección interna de Reservations por cohorte de `Booking.createdAt` y estado actual; no agrega contrato HTTP ni requiere integración frontend hasta DSH-001.
- Pricing incorpora lectura de Rate Plans para catálogo y selección contextual de Booking; frontend ya no debe inferir estado, asignación ni vigencia. No se agrega Detail ni se expone PricingSnapshot.
- DSH-002 finalizado: existe la proyección interna de Occupancy sobre el inventario operacional actual; no agrega contrato HTTP ni requiere integración frontend hasta DSH-001.
- PAY-003 finalizado: nuevo GET paginado de Payment History por Booking con `payment.read`, respuesta `items + pageInfo`, campos públicos únicamente, lectura histórica y sin breaking change.
- PAY-004 finalizado: nuevo endpoint read-only de Outstanding Balance con `payment.read`; expone total, pagado, pendiente, vencido, estado financiero y próximo vencimiento derivados. Funciona sin PaymentPlan cuando existe PricingSnapshot y no introduce breaking change.
- PAY-002 finalizado: Payment Plan permite crear, consultar y reemplazar planes antes de la primera aplicación; los Payments se distribuyen automáticamente entre cuotas y los estados se derivan de montos, aplicaciones y vencimientos.
- IAM-008 finalizado: cambio de comportamiento de autorización, sin breaking change de schema. RECEPTIONIST conserva lecturas de Resources, operación de Booking, cancelación de Booking, Blocks y cálculo estándar de Pricing; no puede mutar Resources, Pricing ni Availability Rules, ni ejecutar Pricing override.
- ADMIN no puede archivar Business ni asignar OWNER; VIEWER permanece read-only por capability y puede ejecutar el cálculo estándar de Pricing sin efectos persistentes.
- Los Roles tenant-scoped no autorizan Create Business, Create User ni Disable User; estas operaciones GLOBAL permanecen fail-closed hasta definir Platform Authority.
- IAM-005 finalizado: Update User es self-service, acepta únicamente `email`, no invalida sesiones y no otorga autoridad global mediante Roles tenant-scoped; breaking change: no.
- IAM-007 finalizado: el catálogo de roles permanece tenant-scoped por Membership, Login conserva `businessId + role` y `VIEWER` queda limitado a lectura.
- BKG-006 finalizado: Booking expone Timeline paginado con cursor opaco y los cuatro eventos funcionales aprobados.
- Cancel acepta motivo opcional, visible únicamente en el evento de cancelación correspondiente.
- Confirm persiste PricingSnapshot.
- Availability considera Bookings, Blocks y reglas configurables.
- API disponible dentro del stack Docker.

## Decisiones / hallazgos pendientes

- **PAY-001 public response DTO:** corregido por PR `#84`, merge `749ac32`. `POST /api/businesses/:businessId/bookings/:bookingId/payments` responde solamente `id`, `bookingId`, `amountMinor`, `currency`, `method`, `reference`, `note`, `paidAt`, `createdAt`, `recordedByUserId` y `status`; no expone metadatos internos y conserva idempotencia, permisos y GET de PAY-003.

La revisión Swagger Jeni/Tobera puede generar:
- bugs;
- decisiones de seguridad;
- inconsistencias de API;
- capacidades faltantes;
- mejoras de documentación.

No implementar estos hallazgos hasta clasificarlos y aprobarlos.

### Subscription & Entitlements — implementación técnica completa, decisión comercial pendiente

Backend real y UI en perfil/alta de Resource implementados en `codex/subscription-entitlements`, dependiente de #92/#91/#90. TOP Inicial provisional: 10 operativos, enforcement atómico, lectura para miembros y solicitud única solo OWNER. Contratos/reglas/operación en Domain Bible, Business Rules y Architecture. Gates backend completos PASS (1517 pruebas de cobertura y 194 escenarios de aceptación); frontend 429 pruebas completas PASS más integración Auth de logout. QA Edge desktop/móvil emulado con API real, cupo 0/8/9/10 y aislamiento entre Businesses PASS. FE-SUB-001 es el único In Progress: implementación técnica completa; decisión comercial de nombre/cupo pendiente antes de producción. Recuento preparado al integrar la cadena: 52 activas, 51 Completed, 1 In Progress, 0 Planned y 0 Blocked. Quality gate resuelve bundle, escala PYG y fechas IANA de Calendar; evidencia final en #94. MVP final no cerrado por decisión comercial pendiente.
