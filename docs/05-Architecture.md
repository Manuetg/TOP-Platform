# TOP — Arquitectura técnica inicial

## Finance — diseño e interfaces de la entrega autorizada (2026-10-05)

Antecedente del 05/10/2026: contrato de trabajo iniciado sobre PR #101 head `99a51148cc12839cdc1bea3ed303961ffd27698c`; ese inicio no acreditaba merge ni gates. [Backlog](07-Backlog.md) mantiene estado y GWT; [Domain Bible](03-Domain-Bible.md) y BR-087–094 definen autoridad. El encargo permitió empezar antes del merge en checkout aislado, revalidar develop/reconciliar sin reescribir trabajo ajeno y repetir controles afectados al integrarlo. No cambia configuración global, red, trust, datos reales, dependencias bloqueadas ni `releaseApproved=false`.

Revalidación del 07/10/2026: PR #101 está mergeada en `develop@9332fa6b6750c0dd326d0b69df24d0ba0725d8b9`, con árbol idéntico a la base Finance `99a51148cc12839cdc1bea3ed303961ffd27698c`. El inicio previo al merge queda como antecedente histórico. Los manifiestos finales de fuentes acreditan Full12 backend, los tres controles frontend y navegador real móvil/desktop PASS localmente, según [Estado actual](00-Current-Status.md); no acreditan CI del nuevo HEAD ni aceptación formal. La mutación ampliada está `DEFERRED_BY_USER` y no se presenta como PASS.

### Ownership y persistencia

`finance` usa las capas domain/application/infrastructure/presentation del monolito; frontend `features/finance` reutiliza app/shared. Finance consume exclusivamente contratos públicos de Business, Identity, Resource, Booking, Pricing y Payment. Payment añade el reader público mínimo necesario para origen/asignación; no se importan repositorios privados de otro módulo ni se inventa un bus, event sourcing, framework o proyección sincronizada eventualmente.

Decisión técnica V1 implementada: caja/obligaciones se leen derivadas de fuentes, sin tabla de balance editable. El schema y 35 migraciones del trabajo actual incluyen `FinanceCatalog` CATEGORY/COUNTERPARTY, `FinanceExpense`/`FinanceExpenseLine`/`FinanceSettlement`, `FinanceAccount`/`FinanceOpening`, `FinanceTransfer`/`FinanceCashMovement`, `FinancePaymentLink`, `FinanceReview`, `FinanceCashCount`, `FinanceRequest` y `FinanceAudit`. El catálogo mantiene nombre inmutable y archivo CAS; apertura inmutable se corrige mediante CashMovement enlazado. Los modelos V2 añaden borradores/plantillas/aprobaciones, importaciones/matching, reglas/asignaciones, costos laborales calculados, presupuesto/compromisos, certificación de servicio, períodos/snapshots y `FinanceEvidenceFile` privado. Un escritor integra schema/migraciones/capabilities/contratos/rutas; esta composición no afirma que existieran en el baseline ni que estén aceptadas todas las historias.

Refs compuestas/scoped y comprobaciones de kind evitan enlazar contraparte/categoría/cuenta/recurso ajenos. FKs restrictivas preservan historia; importe BigInt DB, API number entero seguro PYG y acumulaciones exactas validadas. No persiste saldos ni duplica Payment. Índices solo con consulta/plan que justifique orden/selectividad y coste; migración aditiva probada en vacío y upgrade sintético conserva fingerprints de Payment, Snapshot, Revision y Applications. No usa migrate dev/reset ni una base compartida.

### Escrituras y tiempo

Escritor Finance transaccional revalida actor ACTIVE y Membership OWNER vigente bajo locks, Business ACTIVE para nuevos hechos, tenant de todas las referencias, CAS y valores que determinan saldo. Usa mismo `Business FOR UPDATE` de cambio timezone, con orden estable `User FOR SHARE` → `Membership FOR SHARE` → `Business FOR UPDATE` → fuentes ordenadas, compatible con los escritores vigentes. Amplía el guard de historial timezone a hechos Finance, incluso sin reservas. Carrera de primer gasto/apertura vs timezone se prueba en ambos órdenes: gana un hecho con zona coherente o el cambio falla/relee antes de escribir; no se atribuye RLS a la DB.

Idempotencia por Business/operación/key con fingerprint normalizado y resultado público conservado dentro de la transacción; retry idéntico devuelve resultado original, key con payload distinto da 409. Versiones exactas se comparan antes del no-op, con incremento monotónico. Documentos, líneas, pago/aplicación, movimiento y audit se confirman juntos; fallo inyectado prueba rollback y carreras prueban no sobreaplicación. Apertura firmada declara posición inmediatamente anterior al instante de corte: movimientos `occurredAt < corte` quedan fuera del saldo calculado (`includedInBalance=false`), igualdad o posteriores se incluyen (`>= corte`). Transferencia serializa cuentas en orden estable; no bloquea sobregiro por saldo inventado.

`consumedOn`/`dueOn` son fechas puras válidas. `occurredAt`, `paidAt`, creación y auditoría son instantes con offset explícito almacenados en UTC. Consulta convierte intervalo IANA `[from,to)` a límites reales, incluyendo medianoche/DST; duración V1 de 1..366 días. No agrega deuda histórica si no hay reconstrucción suficiente.

### Contrato HTTP V1 congelado para implementación

Fuente del contrato TypeScript: [finance.types.ts](../backend/src/modules/finance/domain/finance.types.ts). Son interfaces del trabajo actual incluidas en el corte funcional local validado; la publicación y CI del nuevo HEAD siguen pendientes y no se atribuye una verificación independiente de Swagger a esta evidencia. No eran contratos publicados del baseline. Base `/api/businesses/:businessId/finance`, autenticación y capability explícita por operación, sin permiso heredado de `payment.read`.

| Método/ruta | Entrada / salida y semántica |
|---|---|
| `GET /finance?from=YYYY-MM-DD&to=YYYY-MM-DD` | `FinanceReport`: Business/PYG/timeZone, REGISTERED_OPERATIONS, from/to/asOf/token/sourceLimit, catálogos/resources/accounts/expenses/movements/payments/cashCounts, totales y coverage. |
| `POST /finance/commands` | Header `Idempotency-Key`, `FinanceCommand` discriminado `type`; devuelve `{ id, version, type }`. Actor/Business/fingerprint proceden del servidor. |
| `GET /finance/expenses/:id` | `{ expense, audit }` scoped, origen/auditoría autorizados y versión. |
| `GET /finance/export?from=…&to=…&token=…` | CSV operativo; token debe reproducir fuentes actuales del reporte o 409 exige refrescar. Misma cohorte/semántica, no truncación. |

Las **14 acciones** tipadas son `CREATE_CATALOG`, `ARCHIVE_CATALOG`, `CREATE_ACCOUNT`, `ARCHIVE_ACCOUNT`, `OPEN_ACCOUNT`, `CREATE_EXPENSE`, `SETTLE_EXPENSE`, `SET_EVIDENCE`, `LINK_PAYMENT`, `TRANSFER`, `CASH_MOVEMENT`, `REVIEW_MOVEMENT`, `COUNT_CASH` y `ADJUST_COUNT`. Capabilities usadas: `finance.read`, `finance.write`, `finance.export` y `finance.cash-adjust`, todas inicialmente OWNER; ajustes de arqueo/apertura declaran el permiso sensible. Archive/evidence/link/review/adjust usan expectedVersion contractual. Alta de gasto admite settlement opcional en la misma transacción. `report.payments` con `accountId=null` forma la bandeja sin asignar; no existe endpoint `/payments-unassigned`. `type` es un comando cerrado y no un motor arbitrario de acciones.

Lecturas dentro de Repeatable Read entregan un snapshot consistente. Token hash representa filtros/fuentes y export exige igualdad actual o 409; `asOf` declara hora de cálculo y no promete time-travel. Límite explícito 5000 fuentes: exceso se rechaza, nunca responde conjunto parcial como completo. Obligaciones son actuales de los gastos consumidos dentro del intervalo: `coverage.unknownHistoricalDebt=true`. `serviceRevenueAvailable=false` identifica que V1 aún no calcula devengo. Cuenta sin apertura tiene balance null; cuenta negativa indica `negative`; Payment pre-corte asignado conserva `includedInBalance=false`. Liquidación/transferencia/CashMovement nuevos exigen apertura y fecha >=corte; un registro anterior se rechaza, sin importar saldo disponible. Agregados independientes evitan multiplicación por líneas/cuotas. CSV neutraliza formula injection y conserva IDs, moneda, filtros/base/timezone, montos/orígenes y cobertura sin datos salariales no autorizados.

400 identifica entrada inválida; 401/403 autenticación/capability; 404 fuente inexistente o cruzada sin revelar tenant; 409 versión/fingerprint/fuente desactualizada o estado incompatible. Payload/errores/logs no exponen SQL, secretos, fingerprint interno o datos personales adicionales. Los controladores V2/V3 siguientes están montados en el trabajo actual; publicación, Swagger/CI y aceptación final permanecen pendientes.

### Contratos V2/V3 integrados

Las rutas continúan bajo `/api/businesses/:businessId/finance`. [finance-v2.types.ts](../backend/src/modules/finance/domain/finance-v2.types.ts), los contratos públicos Payment/Pricing y los controladores concretos definen los DTO cerrados. Todas las capacidades nuevas permanecen OWNER y default-deny para los demás roles.

| Rutas | Contrato y acceso |
|---|---|
| `/v2/drafts`, `/v2/templates`, `/v2/approval-policy`, `/v2/commands` | Generación manual idempotente, revisión y confirmación; escritura exige `finance.write` más import/planning/approve/labor según el comando. |
| POST `/v2/history-preview`, `/v2/bank-preview`, `/v2/bank-match-preview` | CSV por fila con errores estructurados y cero escrituras de preview; import exige `finance.import`, matching manual exige lectura y confirmación explícita. |
| `/v2/bank-statements`, `/v2/bank-matches`, `/v2/bank-match-sources` | Orígenes canónicos, componentes/residuo y reimportación idempotente, sin feed ni segunda entrada de caja. |
| `/payment-adjustments`, `/terminal-pricing`, `/corrections` | Payment conserva original y publica neto/versión; void/refund/final manual tienen `payment.void`, `payment.refund`, `pricing.final-amount` separados. No se transfiere dinero. |
| `/recognition-sources`, `/service-certificates`, `/terminal-recognitions`, `/profitability`, `/bookings/:bookingId/result` | Noches explícitamente certificadas y política versionada; cobros separados, recursos sin unidad suficiente declarados no soportados. |
| `/v2/costs`, `/v2/resource-results`, `/v2/allocation-rules`, `/v2/labor-costs` | Conservación fuente=destinos+sin asignar, residuos deterministas/versiones; detalle laboral exige `finance.labor`, exclusivamente OWNER. |
| `/v2/budget`, `/v2/budget-comparison?periodMonth`, `/v2/commitments`, POST `/v2/planning-preview`, `/v2/aging` | Presupuesto y escenarios exigen `finance.planning`. La meta aprobada no cambia con el escenario; compromisos convertidos no suman dos veces. |
| `/periods`, `/periods/:id/prepare`, `/periods/:id/close`, `/periods/:id/reopen`, `/periods/:id/snapshot`, `/periods/:id/package` | Checklist/cierre con snapshot inmutable y versiones enlazadas; export exige `finance.export`. Registry verifica funciones/triggers y hashes inmutables fuera del verificador. |
| `/v2/alerts`, `/expenses/:expenseId/evidence`, `/evidence/:fileId/download` | Alertas dentro de TOP. Archivo exige `finance.evidence.read/write` y membresía vigente, sin URL pública ni signedURL. |

`budget-comparison` devuelve forecast/deviation/token null salvo opt-in `forecastBasis=ACTUAL_PLUS_PENDING_COMMITMENTS`: costos ACTUAL operativos conocidos más saldo de compromisos ACTIVE del mismo mes/dimensión, en la misma transacción Repeatable Read y corte servidor. Estimados e imputación del dueño se exponen separados. Fuentes y dimensiones tienen límite de 5000; el exceso falla explícitamente sin truncar. V2 trata `asOf` como instante inclusivo a precisión TIMESTAMP(3); al consumir el mapper V1 expande únicamente el límite superior a +1ms, preservando el intervalo económico `[from,to)` y su contrato original. Procedencia Payment y hechos de caja posteriores impiden presentar un saldo histórico inventado.

El proveedor financiero privado es opt-in `s3-private`; deshabilitado por defecto. PDF/JPEG/PNG de hasta 2MiB tienen verificación de bytes/MIME/hash, nombre UTF-8 y descarga autenticada con revalidación actual. Request/File/auditoría se insertan atómicamente, sin UPDATE de Request inmutable. Política inicial: conservar sin purga automática; no antivirus ni validez fiscal declarados. Restore de prueba copia DB completa más objetos a recursos sintéticos distintos y comprueba IDs/vínculos/hash/permisos.

### Extensiones y validación

FIN-017/018 usan los escritores públicos Payment/Pricing; neto/aplicaciones/saldos/proyecciones conservan originales. FIN-021 certifica explícitamente noches/versiones y fuentes; FIN-023/025 conservan reparto y costos calculados OWNER. FIN-029 guarda snapshots y protege escritores mediante guards SQL verificados; reglas nuevas de octubre no reescriben septiembre cerrado. FIN-032 tiene contrato privado y restore real enfocado. Full12 backend, las regresiones económicas D2, la aceptación ejecutable y el navegador final V1/V2/V3 tienen evidencia funcional local PASS en los alcances y manifiestos de Estado actual; los recorridos no acreditan ejecución de todos los formularios del catálogo. CI del nuevo HEAD, revisión/aceptación formal y mutación ampliada diferida siguen pendientes; implementación y validación funcional local no equivalen a aceptación integral.

Controles de la entrega: Prisma generate/validate/migrate deploy propios, lint/unit/integration/E2E/acceptance/coverage/architecture/build, Core Domain/Application ≥90% demostrado separadamente, Finance y Payment afectado en mutation con break70/high80 sin bajar umbrales. Integración exit0 con suites skipped no acredita DB. Acceptance con fakes o seguridad desactivada no sustituye HTTP autenticado PostgreSQL. Frontend build/lint/test y browser real 390×844/1440×900 se separan de mocks de fallos; seed/browser no comparten DB durante limpieza de suites. Manifest conserva base/head/árbol/estado, fecha/runtime/DB, comando/exit/count/skipped/log/artefactos y CI head/merge-checkout/attempt exactos. Cambios posteriores repiten gates afectados; advisory heredado continúa abierto.


> Composición local del piloto (2026-10-02): contratos incorporados desde Settings FINAL61 a Reservas/LAN. Los controles locales actuales y sus límites se registran en docs/00-Current-Status.md y deploy/pilot/release-manifest.json. Frontend y proxy se aprobaron por composición, sin intento agregado completo verde. CI, validación del operador y release siguen pendientes. Los resultados históricos conservan sus fuentes y fechas; no aprueban merge o despliegue.

### Tu establecimiento - contrato incorporado a la composición local (2026-10-02)

Estado: **In Progress, revisión local**, sin publicación, merge ni despliegue. La continuación explícita del encargo completa metadata y ubicación documentadas del Business; no amplía el MVP con idioma, nuevos canales de contacto, moneda libre ni carga de logo. La restricción temporal por registros afectados fue autorizada explícitamente por el titular el 2026-10-02.

`GET /api/businesses/:id` conserva autorización tenant-scoped y expone `country`, `region`, `city`, `address` como texto nullable; usuarios y Businesses legacy no reciben backfill. `PATCH /api/businesses/:id` exige `expectedUpdatedAt` vigente en ISO UTC exacto con milisegundos. Nombre comercial mantiene trim y 1..120 caracteres; razón social e identificación fiscal conservan su contrato opcional, sin inferir formato RUC ni unicidad. País, departamento/estado y ciudad aceptan hasta 120 caracteres tras trim; dirección hasta 500. Omitir preserva; en campos opcionales, null o texto vacío tras trim limpia. El actor procede del principal autenticado, nunca del body.

El backend revalida User ACTIVE y membresía vigente mediante la matriz de Capability aprobada: OWNER/ADMIN editan metadata, OWNER archiva. Ambos escritores bloquean en orden User, Membership y Business. En PATCH de perfil, la comparación de versión precede al no-op; una versión obsoleta responde 409 incluso si los datos enviados coinciden. Archivo mantiene su contrato idempotente sin versión enviada por el cliente. Cambio efectivo actualiza únicamente campos permitidos y una versión monotónica; `BusinessProfileAudit` conserva entidad/Business, actor, instante, JSON diferencial antes/después y motivo automático, con FKs RESTRICT. Perfil e historial se confirman o revierten juntos.

Archivo es idempotente y escribe únicamente estado y versión bajo el mismo bloqueo; no sobrescribe metadata ni permite restaurar ACTIVE con una entidad leída antes. Se conservan los estados editables previos del Business; no se introduce una nueva restricción Business ACTIVE. El escritor legacy queda interno a compatibilidad de pruebas, sin callers HTTP; la configuración usa el puerto transaccional de cambios.

Moneda conserva PYG exclusivamente, sin conversión ni reinterpretación de importes; el contrato no admite valores distintos. La decisión explícita del titular del 2026-10-02 restringe cambios efectivos de moneda/zona horaria al Business sin registros afectados. Para una timezone IANA distinta, el repositorio ejecuta una consulta parametrizada con EXISTS sobre Resource, Booking, Block y Payment del mismo businessId, sin filtros de estado, incluidos archivados o cancelados. Omitir o mantener la zona no consulta historial ni bloquea metadata. La consulta ocurre después de autorización vigente, Business FOR UPDATE, CAS y cálculo del diferencial, antes de toda escritura/auditoría. Solo esta transacción usa ReadCommitted: el bloqueo de Business entra en conflicto con las inserciones protegidas por sus FK inmediatas y la lectura posterior observa lo que se confirmó mientras esperaba. No cambia configuración real de PostgreSQL. Resultado ausente/no booleano falla cerrado. Historial produce HTTP 400 con explicación para conservar la zona actual; CAS obsoleto sigue siendo 409. No se modifica ningún instante ni dato histórico. Esta garantía cubre la comprobación y escritura frente a inserciones; no vuelve atómicos cálculos previos de otros casos de uso. La UI comunica la restricción y conserva borrador/versión para corregir la zona y guardar los demás datos.

La cuenta sigue independiente del Business. La UI mantiene establecimiento activo visible, roles de lectura, borrador y versión original ante refetch. Ante 409 permite consultar el establecimiento actual y descartar explícitamente antes de guardar con la nueva versión. El guardado cancela consultas antiguas de perfil y lista antes de actualizar ambas caches; un cambio de identidad/Business aborta la operación y evita publicar una respuesta tardía.

La migración es aditiva y no elimina historia. La limpieza ampliada del historial se limita a pruebas con base descartable de nombre test. Los resultados de gates y QA se entregan como evidencia local; no equivalen a aceptación de CI o aprobación de integración con los deltas separados de header, reservas, imágenes y runtime.

Evidencia de concurrencia del corte Settings: dos carreras PostgreSQL entre inserción de Resource y cambio de zona horaria, en ambos órdenes. No acredita todos los interleavings de Resource/Booking/Block/Payment ni vuelve atómicos los cálculos previos de otros casos de uso. La evidencia actual del árbol combinado y sus límites se registra en Current Status; CI y operación real siguen pendientes.

## 1. Objetivos de arquitectura

Permitir construir el MVP con simplicidad, consistencia de reglas de negocio, aislamiento por Negocio, trazabilidad y evolución controlada.

## 2. Principios técnicos

- Monolito modular, DDD pragmático y arquitectura hexagonal simplificada.
- Las reglas de negocio viven exclusivamente en backend.
- Frontend, WhatsApp, IA y futuras APIs consumen las mismas capacidades de aplicación.
- No usar microservicios, CQRS ni Event Sourcing en el MVP.
- Cada dato y operación se ejecuta en el contexto de un Negocio.

## 3. Arquitectura de alto nivel

Clientes → API HTTP → módulos de aplicación → dominio → adaptadores de persistencia, archivos y servicios externos.

## 4. Monolito modular

Un único despliegue contiene módulos con límites explícitos. Cada módulo expone casos de uso y contratos; no accede directamente a la persistencia interna de otro módulo.

## 5. Módulos

- `business`: Negocio, configuración, moneda y zona horaria.
- `identity-access`: usuarios, pertenencia a Negocio y roles.
- `resource`: unidades reservables y estado operativo.
- `pricing`: tarifas, reglas y Pricing Snapshot.
- `availability`: consultas y revalidación de disponibilidad.
- `contact`: contactos responsables e historial.
- `booking`: reservas, estados y estadías; la numeración visible aprobada continúa pendiente de implementación.
- `payment`: planes, pagos, aplicaciones y saldo derivado.
- `block`: indisponibilidades operativas.
- `dashboard`: composición read-only de KPI derivados, sin persistencia propia.
- `search`: composición read-only de resultados limitados por Business; extensión expresamente aprobada bajo FE-FND-009, sin tablas ni repositorio propio.
- `audit`: historial y trazabilidad.
- `files`: adjuntos y comprobantes.

## 6. Capas por módulo

- `domain`: entidades, value objects, reglas y eventos internos.
- `application`: casos de uso, comandos, consultas, autorizaciones y transacciones.
- `infrastructure`: PostgreSQL, almacenamiento de archivos y adaptadores externos.
- `presentation`: controladores HTTP, DTOs y validación de entrada.

## 7. Dependencias permitidas entre módulos

Los módulos dependen de contratos públicos de Application, no de infraestructura ajena. `booking` consume contratos de `availability`, `pricing` y `contact`; `availability` consulta contratos de `resource`, `booking`, `block` y `business`; `payment` consume contratos públicos de `booking` y `pricing` para resolver la Booking y su PricingSnapshot. Booking no depende de Payment en el MVP vigente. Una relación entre datos no autoriza imports bidireccionales y se prohíben dependencias circulares.

PAY-004 reside en `payment` como Query Use Case read-only. Resuelve Business, Booking y PricingSnapshot mediante contratos públicos y obtiene su proyección financiera desde un repositorio de lectura propio. La infraestructura agrega Payments, installments y PaymentApplications mediante una única sentencia PostgreSQL con agregados independientes, evitando multiplicación de filas y observando un único snapshot MVCC sin bloqueo pesimista. No persiste balances ni estados derivados.

Pricing expone `GET /api/businesses/:businessId/rate-plans` mediante `ListRatePlansUseCase` y `RatePlanRepository`. El modo general devuelve el catálogo tenant-scoped; el modo contextual recibe conjuntamente Resource y estadía y aplica las reglas de seleccionabilidad antes de mapear al `RatePlanResponseDto` público. No accede a Booking ni expone PricingSnapshot, y no requiere cambios de schema.

Dashboard consume contratos públicos de Application de los dominios propietarios. DSH-002 obtiene su proyección desde Availability, que agrega Resource, BookingResource, Booking y Block en PostgreSQL sin exponer su infraestructura a Dashboard. DSH-003 obtiene desde Payment un agregado tenant-scoped de Payments `RECORDED` por `paidAt`; la infraestructura agrupa por moneda mediante una única consulta PostgreSQL parametrizada, sin cargar Payments ni unir Booking, PricingSnapshot, PaymentPlan o PaymentApplications. DSH-004 obtiene desde Booking un agregado tenant-scoped por `createdAt` y estado actual mediante una única consulta PostgreSQL, sin cargar Bookings ni unir Resources, Contact o Timeline. Estas capacidades no tienen endpoint propio; DSH-001 las ejecuta concurrentemente desde Application y expone su composición all-or-nothing bajo `GET /api/businesses/:businessId/dashboard`, sin infraestructura de Dashboard. Los dominios fuente no dependen de Dashboard y no se persisten ni cachean los agregados.

FE-FND-009 incorpora `GET /api/businesses/:businessId/search?q=...` como extensión aprobada del baseline backend 53/53. Search consume lectores públicos de Application de Resource, Contact y Booking; cada módulo propietario filtra y limita en PostgreSQL. No importa infraestructura ajena, no modifica los contratos HTTP existentes, no hay dependencias inversas ni N+1. Identity expone la resolución de capabilities basada en membresía vigente y la AuthorizationPolicy existente. `search.read` permite entrada a los cuatro roles, pero cada lector requiere su capability de lectura; los grupos denegados no se ejecutan ni se serializan. Se exige Business ACTIVE, se ejecutan consultas autorizadas concurrentemente y se falla todo el bloque ante un error técnico. Respuesta mínima no-store; sin índices, migraciones, caché persistente ni servicios externos.

## 8. Modelo multi-tenant

`business_id` forma parte de toda entidad operativa. Cada caso de uso valida el contexto y el estado del Negocio exigido por su contrato y las consultas se filtran obligatoriamente por ese contexto. No se permite cambiar el Negocio de una entidad existente.

## 9. Identidad y autorización

Identificadores internos UUID. Roles tenant-scoped: `OWNER`, `ADMIN`, `RECEPTIONIST` y `VIEWER`. Todas las autorizaciones se validan en backend antes de ejecutar capacidades y la matriz Role → Capability de IAM-008 es la autoridad.

- `OWNER`: accede a las capabilities BUSINESS vigentes de su Negocio.
- `ADMIN`: opera y configura dentro de las capabilities vigentes; no archiva Business ni asigna OWNER.
- `RECEPTIONIST`: opera las capabilities aprobadas de Contact, Availability, Block, Booking y Payment; no configura Resource, Pricing ni Availability Rules.
- `VIEWER`: accede únicamente a capabilities de lectura.

Los roles tenant-scoped no conceden autoridad GLOBAL. En el corte inicial descrito por esta sección, Payment void/refund, Ownership/Subscription y sus autorizaciones permanecían fuera del alcance implementado. La entrega Finance superior incorpora únicamente void/refund y sus capacidades separadas; Ownership/Subscription conserva su límite anterior.

El rol se resuelve desde UserBusinessMembership para el `userId + businessId` solicitado y no se incluye en el JWT. IAM-007 no incorpora endpoints de Roles, cambio posterior de rol ni un modelo persistido de Permissions.

IAM-008 reemplaza la inferencia final basada en verbos HTTP por una policy estática y tipada de capabilities. `AuthorizationPolicy` es lógica pura, independiente de NestJS, HTTP y Prisma; `BusinessAuthorizationGuard` actúa como adaptador HTTP, obtiene actor y Business, resuelve la Membership vigente e invoca la policy antes del caso de uso. Toda ruta BUSINESS declara su capability y la ausencia de capability o permiso se resuelve con default deny. El catálogo incluye las capabilities vigentes de Business, Membership, Contact, Resource, Availability, Block, Pricing, Booking, Payment y Dashboard; `dashboard.read` usa scope BUSINESS y permite lectura a los cuatro roles tenant-scoped.

Los scopes de autorización son `BUSINESS`, `SELF`, `GLOBAL`, `PUBLIC` y `SYSTEM`. La matriz Role → Capability solo concede autoridad BUSINESS. Las operaciones GLOBAL `POST /api/businesses`, `POST /api/users` y `PATCH /api/users/:id/disable` quedan fail-closed hasta que exista una autoridad de plataforma aprobada. IAM-008 no agrega Permission tables, migración, endpoint, Role al JWT ni cambio posterior de Role.

IAM-005 es self-service sobre la identidad global: `PATCH /api/users/:userId` exige JWT `ACTIVE` y coincidencia entre `sub` y `userId`. Por excepción autorizada del 2026-10-02, acepta únicamente el mismo email normalizado como no-op sin escritura; todo cambio efectivo responde `409 EMAIL_CHANGE_UNAVAILABLE`. El caso de uso solo consulta la identidad por ID, sin buscar destinos duplicados ni llamar a un escritor. No usa roles tenant-scoped para otorgar autoridad global y preserva Membership, Credential, versiones y sesiones. Configurar SMTP no habilita el cambio: antes requiere un flujo revisado de reautenticación y verificación.

> IAM-005, descripción histórica previa a la suspensión autorizada: IAM-005 es self-service sobre la identidad global: `PATCH /api/users/:userId` exige JWT `ACTIVE` y coincidencia entre `sub` y `userId`. Solo persiste el email permitido mediante `UserRepository`; no usa roles tenant-scoped para otorgar autoridad global, no modifica Membership ni Credential y no revoca sesiones porque la identidad `sub` permanece estable.

### Ampliación de Tu cuenta — encargo del 2026-10-02

Estado: **In Progress, composición local para revisión**. Fuente: contrato de Settings FINAL61, preparado originalmente desde 0dc22cd18c403fb0446818c7bb57b63e26820f0c. Esa referencia identifica su origen; los controles locales cerraron según los alcances de Current Status; el cierre de CI y operación se registra por separado, sin aprobación de release, merge ni despliegue.

La solicitud explícita del titular amplía el contrato personal y sustituye el requisito de motivo manual del corte del 2026-10-01. `GET/PATCH /api/users/:id/profile` conservan scope `SELF`, UUID válido, actor `ACTIVE`, independencia del Business y `Cache-Control: no-store`. Nombre completo conserva `displayName` obligatorio, trim y 1..120 caracteres. Se incorporan `birthYear`, `username`, `phone` y `avatarId` opcionales: omitir preserva; `null` borra; usuarios legacy se leen como `null`, sin backfill.

- `birthYear`: únicamente año entero entre 1 y el año UTC vigente; no fecha completa, edad mínima ni obligatoriedad.
- `username`: alias de perfil opcional con trim y máximo técnico de 50 caracteres. Conserva la etiqueta visible «Nombre de usuario» y explica que es un alias; no cambia Login ni presupone unicidad.
- `phone`: número internacional con `+`, sin extensión, validado con la dependencia existente y normalizado a E.164. Un string vacío se normaliza a `null`; no implica verificación ni capacidad de mensajería.
- `avatarId`: catálogo cerrado local `user`, `leaf`, `sun`, `mountain` o `null`, con Lucide regular y tokens TOP. No acepta URLs ni archivos; no introduce almacenamiento externo.

PATCH recibe `expectedUpdatedAt` exacto en ISO UTC con milisegundos; `reason` ya no se pide ni se acepta como fuente de auditoría. El backend genera el motivo `Actualización del perfil por su titular.`. BR-056 conserva entidad, sujeto, actor, instante y valores anteriores/nuevos. `UserProfileAudit` añade JSON diferencial de las claves cambiadas; `UserDisplayNameAudit` se conserva íntegra y sigue registrando cambios efectivos de nombre. Ambas escrituras y perfil comparten transacción con FK `RESTRICT`; un fallo revierte todo.

Se conserva bloqueo `User FOR UPDATE`, revalidación SELF/ACTIVE y comparación de versión antes del no-op. Un conflicto responde `409`, incluso con valores idénticos. Un no-op con versión vigente no escribe ni audita; un cambio avanza la versión al menos un milisegundo. Se preservan correo, verificación, estado, credenciales, membresías, permisos, sesiones y tokens. El DTO añade exclusivamente los cuatro campos personales a `id`, `email`, `displayName`, `status`, `updatedAt`; Login/JWT no se amplían.

La UI mantiene borrador y versión original ante refetch; ante conflicto consulta y permite descartar antes de guardar con la nueva versión. Campos opcionales pueden limpiarse; avatares usan radios nativos y foco visible. La cuenta permanece accesible sin Business y al cambiar de establecimiento. Año usa entrada textual con teclado numérico para no convertir tokens inválidos en borrado; teléfono conserva entradas formateadas completas antes de normalizar en backend.

Correo sigue de lectura. Por instrucción explícita para el piloto LAN de Ema, sin servicio de envío, todo cambio efectivo mediante IAM-005 queda suspendido con `409 EMAIL_CHANGE_UNAVAILABLE`. La ruta valida SELF/ACTIVE y admite únicamente el no-op del mismo correo normalizado, sin escritura, auditoría ni cambio de versión. No consulta duplicados y no usa consoleOTP como prueba de entrega. La cuenta ya verificada conserva su acceso; diferir SMTP no bloquea su uso en el piloto. Esta suspensión no se levanta por cambiar variables de transporte: requiere implementar y revisar un flujo de reautenticación y verificación.

El flujo seguro de correo, sesiones/tokens y la carga segura de foto/logo necesitan contrato y decisiones propios. El contrato de avatar es un catálogo local; la composición no declara aplicada ninguna propuesta separada de avatar en el header. Tu establecimiento conserva PYG como única moneda del MVP; la restricción de cambios de moneda/zona horaria con registros afectados fue autorizada explícitamente el 2026-10-02 y se describe en su contrato vigente. Configuración LAN, cookies y CORS globales pertenecen a otro delta y no se modifican.

### Perfil personal - contrato histórico del nombre (2026-10-01)

> Corte histórico del 2026-10-01. Se conserva su descripción, auditoría y evidencia como historial. El contrato vigente de la ampliación del 2026-10-02 incorpora campos opcionales, motivo automático y suspensión del cambio efectivo de correo; el requisito de reason manual de este corte no rige para ese contrato.

`GET` y `PATCH /api/users/:id/profile` incorporan una capacidad separada para lectura de identidad y actualización exclusiva de `displayName`, autorizada por el encargo de configuración y perfil. Estado **In Progress**, con contrato de nombre cerrado e implementación integrada en el snapshot local ee038ce, con gates locales registrados en Estado actual; no se declara Completed ni aprobación de PR. Ambos endpoints requieren autenticación y scope `SELF`, validan UUID, coincidencia entre actor y path y User `ACTIVE`, sin resolver membresías ni roles del Business activo.

Los casos de uso `GetUserProfileUseCase` y `UpdateUserProfileUseCase` residen en Identity. PATCH recibe `displayName`, `reason` y `expectedUpdatedAt`: valida nombre string, `trim` y longitud final de 1 a 120, motivo real ingresado por el usuario y recortado no vacío, y versión ISO UTC con milisegundos. GET conserva `null` para nombres legacy ausentes. `UserProfileResponseDto` publica solo `id`, `email`, `displayName`, `status` y `updatedAt`, con `Cache-Control: no-store`; no serializa credenciales, hashes, tokens, sesiones, membresías, auditoría ni verificación interna.

El puerto aditivo `UserProfileChangeRepository` recibe sujeto, actor, nombre, motivo y versión esperada. El adaptador Prisma abre una transacción y bloquea la fila mediante SQL parametrizado `SELECT ... FROM "User" ... FOR UPDATE`, obtiene el valor actual y comprueba `SELF`, `ACTIVE` y `updatedAt` exacto. Un conflicto de versión se traduce a HTTP `409` antes de decidir un no-op. Un cambio efectivo actualiza solo `displayName` y `updatedAt`, que avanza al menos un milisegundo respecto al valor actual; no vuelve a persistir email, estado ni `emailVerifiedAt` de un snapshot previo, ni modifica Credential, Membership o RefreshSession.

La misma transacción crea `UserDisplayNameAudit` con User sujeto, actor autenticado, fecha/hora, nombre anterior real nullable, nombre nuevo y motivo, conforme a BR-056/BR-063. Si falla la auditoría se revierte también nombre y versión. La migración aditiva crea esta tabla, su índice por sujeto/fecha/id y FK `RESTRICT` a sujeto y actor; no hace backfill de nombres ni de auditorías históricas. Nombre normalizado idéntico con versión vigente devuelve el perfil sin escritura, auditoría ni avance de versión; los tokens se conservan. Repetir un cambio confirmado con la versión anterior devuelve `409`. La concurrencia y el rollback se verifican sobre el commit integrado mediante los gates correspondientes; resultados y límites en Estado actual.

El consumidor frontend usa la API compartida, consulta el perfil por identidad y envía nombre, motivo ingresado por el usuario y la versión consultada. Ante `409`, debe consultar datos actuales antes de permitir un nuevo intento con la versión vigente; el correo se presenta para lectura. IAM-005 y su comportamiento de sesiones se preservan. El modelo actual `EmailVerificationToken` referencia User y carece de un email de destino congelado; `VerifyEmailUseCase` marca verificado por `userId`, mientras `updateEmail` conserva `emailVerifiedAt`. La habilitación de cambio seguro de correo, su revalidación y política de tokens/sesiones permanecen pendientes y no se incorporan en esta capacidad.

## 10. Persistencia

PostgreSQL es la base relacional. Relaciones many-to-many se representan explícitamente cuando el dominio lo requiere. `BookingResource` relaciona Booking y Resource; las fechas de estadía pertenecen a Booking. El flujo principal se optimiza para una unidad, pero el modelo soporta múltiples Resources.

Booking usa UUID interno. El número entero secuencial único por Negocio sigue aprobado como identificador visible futuro, pero no forma parte del schema implementado actual.

## 11. Modelo monetario

Importes monetarios se almacenan como enteros en la unidad mínima de moneda; no se utiliza `float`. El MVP admite una única moneda por Negocio y usa redondeo matemático estándar a la unidad mínima. Impuestos y multimoneda quedan fuera del primer MVP.

## 12. Fechas y zonas horarias

Instantes técnicos se almacenan en UTC. Cada Negocio usa una zona horaria IANA. Fechas puras de entrada y salida se almacenan como `date`; la presentación convierte horas a la zona horaria del Negocio.

Los intervalos temporales son semiabiertos: `[inicio, fin)`. Una Booking que termina en una fecha no entra en conflicto con otra que comienza en esa misma fecha.

## 13. Transacciones y concurrencia

> Flujo legacy de confirmación con creación del Snapshot: Confirmar Booking ocurre en una única transacción atómica: valida autorización y datos, revalida Availability, protege los registros necesarios, persiste Booking confirmada y Pricing Snapshot, registra su Timeline y confirma la transacción.

El alta nueva desde Calendario persiste Booking PENDING, PricingSnapshot y Timeline en una transacción; el primer Payment RECORDED positivo puede confirmar esa reserva dentro de la transacción financiera. Confirmar sin cobro exige total vigente exacto cero, leído de la última PricingRevision o del Snapshot original bajo locks de Booking/Snapshot, sin crear Payment. La edición conserva el Snapshot y cobros, y añade revisiones de precio append-only conforme a los apartados QA del 2026-10-02 de Domain Bible y Business Rules.

Dos solicitudes incompatibles sobre el mismo Resource no pueden completarse. La implementación inicial usa transacción de base de datos, bloqueo pesimista o restricción equivalente, verificación final de solapamiento e idempotencia para evitar duplicados. El mecanismo concreto de Prisma/PostgreSQL se define durante implementación, sin cambiar este comportamiento.

## 14. Eventos de dominio internos

Los módulos pueden publicar eventos internos después de completar la transacción, por ejemplo `BookingConfirmed`, `PaymentRegistered` o `BlockCreated`. No se adopta Event Sourcing ni un bus distribuido en el MVP.

## 15. API

API HTTP versionada, orientada a recursos y casos de uso. Autentica usuarios, resuelve contexto de Negocio, valida DTOs y delega en application. Los endpoints implementados se documentan en el Backlog y OpenAPI; los contratos de capacidades planificadas permanecen pendientes hasta su discovery.

## 16. Archivos y comprobantes

`files` almacena metadatos y referencias a un proveedor de almacenamiento. Payment puede asociar comprobantes; no se guardan binarios en tablas de dominio. Proveedor, límites y formatos quedan pendientes.

## 17. Auditoría y observabilidad

`audit` registra entidad, identificador, usuario, instante, cambios y motivo cuando corresponda. Logs estructurados, métricas y trazas son necesarios; su plataforma concreta queda pendiente.

## 18. Seguridad

Autenticación, autorización por rol, aislamiento por Negocio, validación en backend, mínimos privilegios y protección de secretos. No se almacenan credenciales bancarias ni datos sensibles de tarjetas.

### POST-B — primer corte de arranque seguro (2026-09-30)

Configuración central en `backend/src/config/environment.ts`, integrada con ConfigModule antes de crear el servidor HTTP. Se aceptan development/test/production; sin NODE_ENV de runtime se usa development y solo allí se carga `.env`. ConfigModule ignora archivos env en test/producción. El bootstrap HTTP por defecto (`main.ts`) captura/valida runtime antes de importar Prisma; en producción inspecciona los metadatos del cliente generado sin importarlo y rechaza rutas de autoload env o formato desconocido. Esa protección corresponde al bootstrap HTTP, no a CLI ni imports directos de AppModule. La imagen genera ese cliente en contexto limpio; no se parchea SDK ni schema. Los errores indican variable/requisito sin valores; el proceso termina con error antes de listen. ConfigService conserva el snapshot validado (`skipProcessEnv`) y los clientes Prisma reciben explícitamente DATABASE_URL, preservando sus parámetros. La comprobación del artefacto debe revisarse al actualizar Prisma.

Los cuatro TTL de autenticación conservan sus defaults y exigen conversión exacta a milisegundos y expiración dentro del rango Date y DateTime de Prisma vigente (año hasta 9999) al sumar el instante de validación. El máximo técnico se calcula una vez por validación con el reloj actual; no introduce un techo comercial ni cambia algoritmos/contratos. Fórmula y alcance temporal de la comprobación en README backend.

El perfil estándar de producción exige JWT y OTP independientes de al menos 32 bytes, URL pública y CORS HTTPS explícitos, SMTP y almacenamiento S3 completo. SMTP usa TLS directo en puerto 465 y STARTTLS obligatorio en los demás, con certificados validados; se construye únicamente el adaptador seleccionado. No hay pruebas remotas obligatorias de SMTP/storage al arrancar. S3 conserva SDK, upload/delete/paths, URLs firmadas y fallback opcional del endpoint público; memoria solo en desarrollo/test sin bucket. Defaults y matriz completa en [README backend](../backend/README.md).

El perfil temporal explícito TOP_DEPLOYMENT_PROFILE=lan-pilot conserva NODE_ENV=production y restringe el acceso a un único origen HTTP de IPv4 privada con puerto 3001. El gateway publica frontend, API y lecturas firmadas; API, PostgreSQL y MinIO permanecen sin puertos host. El correo queda deshabilitado con EMAIL_FEATURE_DISABLED antes de consultas o escrituras de los flujos de entrega; el Login conserva la exigencia de cuenta ACTIVE ya verificada. HTTP no cifra credenciales, tokens, fotos ni datos y no autentica el servidor ante intermediarios. El contrato y la intervención del operador están en [la guía del piloto](../deploy/pilot/README.md); releaseApproved permanece false; los controles locales y sus límites constan en Current Status, mientras CI y operación se registran por separado. La excepción LAN no modifica los requisitos del perfil estándar ni acredita operación real, CI o cumplimiento legal.

CORS compara orígenes completos, sin comodines ni fallback abierto. Orígenes ajenos no reciben permiso ni producen 500; preflight conserva autenticación e idempotencia. Guards y aislamiento por Business siguen siendo la autoridad, también sin Origin. Swagger UI/JSON/YAML no se generan ni registran en producción. La auditoría de controladores registrados no encontró rutas HTTP exclusivas debug/test/seed; seed y aprovisionamiento siguen siendo CLI controladas.

Imagen Node22 Alpine con OpenSSL y NODE_ENV=production en el stage final; compilación y dependencias operativas se resuelven en stages separados. El runtime instala con omit=dev/optional, conserva Prisma CLI6.19.3 explícitamente para migraciones de API_IMAGE, copia el cliente generado limpio, dist/src sin pruebas, schema/migraciones y package.json; excluye fuentes, seed y herramientas de desarrollo. Los tipos transitivos exigidos por dependencias productivas se conservan. Compose declara development y conserva volúmenes. Ignore Git/Docker excluye env y credenciales; `.env` local se preserva fuera del índice. Este corte cubre B3/B4/B6 y configuración/empaquetado de B2: no modifica dominio, contratos, esquema ni proveedor cloud y no acredita todo B ni Production Ready.

## 19. Testing

Priorizar pruebas de dominio y aplicación para reglas de negocio, integración para persistencia/transacciones y pruebas de API para contratos críticos. Casos de doble reserva, auditoría y aislamiento son obligatorios.

## 20. Despliegue inicial

Un servicio backend, PostgreSQL administrado y almacenamiento de objetos S3-compatible. Configuración por variables de entorno, migraciones versionadas y backups de base de datos.

## 21. Estructura de carpetas propuesta

```text
backend/
  src/modules/<module>/{domain,application,infrastructure,presentation}
  src/shared/{database,http,auth,observability}
  src/main.ts
```

## 22. Decisiones explícitamente fuera del MVP

- Microservicios, CQRS y Event Sourcing.
- IA, WhatsApp automatizado, Marketplace, Channel Manager y Revenue Management.
- Contabilidad, facturación electrónica, pagos online y conciliación bancaria.
- Inventario, Maintenance, Cleaning, CRM avanzado, múltiples sucursales, reservas parciales y jerarquías de Resource.

## 23. Riesgos y decisiones pendientes

- Stack aprobado: TypeScript, NestJS, PostgreSQL, Prisma, REST con OpenAPI, almacenamiento S3-compatible, Docker y GitHub Actions. Se adopta por tipado, modularidad, ecosistema, migraciones y despliegue simple. Puede registrarse posteriormente mediante ADR sin bloquear el MVP.
- La autenticación propia en NestJS para el MVP se define en [ADR-001: Estrategia de autenticación para el MVP](13-adr/ADR-001-estrategia-autenticacion-mvp.md). El proveedor concreto de almacenamiento S3-compatible, la solución inicial de observabilidad, la política y proveedor de backups, el proveedor de despliegue, y el tratamiento futuro de impuestos y multimoneda permanecen pendientes.

## 24. Subscription & Entitlements del MVP

El módulo Subscription persiste `SubscriptionPlan` y `BusinessSubscription`. `SubscriptionCoreModule` publica el puerto `RESOURCE_QUOTA`; Resource lo utiliza para serializar altas mediante `pg_advisory_xact_lock` por Business y transacción Prisma. Resource conserva la responsabilidad del conteo y escritura de su inventario dentro de esa transacción; Subscription conserva la asignación y el cupo. El scope de transacción es opaco para application. La composición de lectura usa `RESOURCE_USAGE_READER`, evitando acceso privado entre módulos y ciclos de módulos Nest.

Contratos nuevos, ambos con `Cache-Control: no-store`, UUID validado, autenticación y Membership vigente:

- `GET /api/businesses/:businessId/subscription`: `subscription {planCode, planName}`, `entitlements {maxResources}`, `usage.resources {used, available, percentage, state, canCreate}` y `upgrade {status, requestedAt}`. Todos los roles leen. Business no activo produce 409; inexistente 404. Error de una proyección no devuelve datos parciales.
- `POST /api/businesses/:businessId/subscription/upgrade-request`: sin payload comercial; OWNER registra su actor desde el principal. Responde 200 `{status: REQUESTED, requestedAt}` tanto al crear como al repetir. No envía comunicaciones externas ni cambia el plan.
- Consumidor afectado: `POST /api/businesses/:businessId/resources` agrega el conflicto `409 {code: RESOURCE_LIMIT_REACHED, message}`; su payload y respuesta exitosa permanecen compatibles.

La UI usa `apiRequest` y QueryClient con clave `subscription/userId/businessId`, separada del token renovable. Perfil y alta de Resource comparten la lectura. Cambio de identidad/Business cancela lecturas y aborta mutaciones pendientes; resultados tardíos no confirman otra pantalla. La creación de Resource invalida cupo/listado; un GET posterior fallido no repite el POST. Un plan desconocido o no actualizado bloquea el alta en UI hasta reintentar. Backend siempre revalida el límite concurrente.

Operación MVP: el registro persistido es el destino real de «Solicitar ampliación». El operador autorizado puede consultar pendientes con `SELECT "businessId", "upgradeRequestedAt", "upgradeRequestedBy" FROM "BusinessSubscription" WHERE "upgradeRequestedAt" IS NOT NULL ORDER BY "upgradeRequestedAt";` dentro del entorno administrativo protegido. No se exporta esta información al cliente ni se inventa un contacto comercial. La resolución comercial y un eventual cambio de plan requieren decisión y procedimiento administrativo auditado; no son un cobro o upgrade automático de este MVP.

## POST-MVP A — contratos y consumidores (2026-09-24)

ArchiveContactUseCase valida Business activo e identificadores; `ContactRepository.archive` realiza la transición tenant-scoped e idempotente y su auditoría en una transacción PostgreSQL. La migración aditiva `20260924000000_contact_archive_audit` incorpora `Contact.archivedAt`, `archivedBy` y `archivedFromStatus`, sin backfill ni cambios en FK/Bookings. Un update ordinario ya no escribe status; evita restauraciones por una edición concurrente. Auditoría interna no se añade al DTO público.

`PATCH /api/businesses/:businessId/contacts/:contactId/archive`: sin body; `contact.write`, JWT/membresía vigente, actor desde principal. Respuesta 200 ContactResponseDto (también al repetir), 400 identificadores inválidos, 401/403 autenticación/autorización, 404 Business/Contact ausente o Contact cruzado y 409 Business no activo. No expone Restore. Contact Detail permanece abierto con éxito, invalida detalle/listado/búsqueda y aborta al desmontarse/cambiar contexto. Abortar el cliente no implica rollback backend.

POST/PATCH Contact mantienen campos públicos. `libphonenumber-js/min` con versión fija en ambos lockfiles proporciona metadatos de país/prefijos y longitud posible, evitando un catálogo mundial manual y sin añadir un paquete UI. Es una dependencia acotada justificada por A3 ([documentación primaria](https://github.com/catamphetamine/libphonenumber-js)); carga con las rutas consumidoras. País usa labels españoles/ISO y aliases del catálogo existente. Nuevos valores con contexto se normalizan a E.164; el contrato legado sin país y valores históricos no editados se preservan según Business Rules. WhatsApp solo genera enlace para un número internacional inequívoco.

ConfirmBooking conserva los requests basados en Rate Plan y la variante explícita `pricingMode: MANUAL_NO_RATE_PLAN`, con `resourceId`, `agreedAmountMinor` y `overrideReason` obligatorios y `ratePlanId` omitido por completo. El guard exige `pricing.override.calculate` (OWNER/ADMIN) ante modo, monto o motivo, aun si están vacíos o nulos. La ausencia implícita de plan no habilita el modo manual; un modo manual junto con `ratePlanId` se rechaza. No cambia el endpoint de override sobre plan.

`PrepareManualPriceUseCase` comparte validación monetaria/motivo y utiliza las validaciones necesarias de Business, Resource y fechas sin depender de `ListRatePlansUseCase` ni consultar el catálogo para decidir elegibilidad. Revalida identificadores, estados activos, pertenencia al tenant y estadía de 1..365 noches; obtiene la moneda del Business. Un tarifario nuevo o aplicable no provoca el antiguo 409 de elegibilidad manual. Se mantienen locks de Booking/Resource, autorización, validación de disponibilidad y transacción atómica de Snapshot, estado y Timeline. Las demás condiciones de confirmación siguen siendo autoritativas en backend.

`PricingSnapshotItem` es una unión discriminada compatible con históricos: CALCULATED/MANUAL_OVERRIDE conservan su forma; MANUAL_NO_RATE_PLAN tiene `ratePlanId`, `suggestedAmountMinor` y `adjustmentAmountMinor` nulos, `breakdown: []`, noches reales, monto acordado y motivo normalizado. El identificador expresa falta de referencia en el precio registrado, sin afirmar que no haya planes disponibles. Actor en BOOKING_CONFIRMED y fecha en Snapshot/Timeline según los contratos existentes. `items` ya es JSON: no requiere migración SQL ni reescritura histórica. PaymentPlan, Payments y saldos usan moneda/total; Revenue sigue sumando pagos registrados, sin convertir el precio manual en descuento.

Calendar y Confirm Booking ofrecen Configurada y Manual a OWNER/ADMIN con contexto válido. Configurada conserva selección de plan, cálculo y descuentos; sus estados de carga, error y refetch corresponden al catálogo. Manual permite importe y motivo sin selector, selección oculta ni cálculo previo, incluso con cero, uno o varios planes; carga, error o refetch del catálogo no desmontan ni bloquean su edición. El prefijo fijo dentro del input usa la moneda del Business, queda fuera del valor editable y del payload, y para PYG `₲ 450.000` produce `agreedAmountMinor: 450000`. Cambiar identidad, Business, Booking, Resource o fechas invalida el borrador anterior y descarta respuestas tardías; cambiar de modo no mezcla precios ni previews. Si Calendar ya envió la reserva a PENDING y falla la confirmación, abre la confirmación de esa misma reserva con el error; no crea otra al reintentar.

Presentación frontend: helper puro `formatPureDate` (dd/mm/yyyy) separado de `formatBusinessInstant` (timezone IANA explícita). ISO permanece en API, inputs nativos y atributos dateTime. Calendar conserva encabezados de mes/día como navegación parcial. ConfirmDialog reutiliza OverlayPanel y Foundation; carga bloquea cierre/duplicados, error queda en el diálogo y el cierre devuelve foco sin desplazar una navegación del shell.

## 25. Quality gate frontend del MVP (histórico)

Las páginas operativas y Login usan `React.lazy`/`Suspense` por ruta; el shell y los guards permanecen disponibles y la espera expone un status accesible. Se conserva el respaldo por página y general; errores de importación no exponen detalles internos. No se elevó el umbral de 500 kB.

Calendar consume Business Context; se elimina su única dependencia productiva de `VITE_DEV_BUSINESS_ID`. Sus lecturas reciben AbortSignal desde QueryClient y sus operaciones encadenadas cancelan al cerrar/desmontar. Una respuesta de alta tardía no inicia Submit/Confirm, no navega ni actualiza otra UI. El backend puede haber confirmado una operación antes del aborto: la cancelación cliente no equivale a rollback y no borra reservas. El diálogo reutiliza OverlayPanel, foco, Escape y Tab; la identidad estable no depende del token rotado.

El helper monetario compartido de presentación/entrada mantiene PYG entero. No implementa reglas financieras ni conversión FX; Pricing y Payments continúan consumiendo importes calculados por backend. Los contratos HTTP y datos persistidos permanecen intactos.

Calendar mantiene fechas puras YYYY-MM-DD en Availability y Booking. El helper business-date usa Intl/IANA para fecha del instante y límites de día comercial (incluye DST y medianoche ausente/repetida). Blocks recibe límites UTC RFC3339 derivados de activeBusiness.timezone y se intersecta con intervalos locales [inicio, fin). El soporte UTC para aritmética gregoriana y etiquetas no define los instantes comerciales. Cambiar Business/identidad/timezone remonta el estado del calendario, cancela lecturas/operaciones y recalcula límites; no se cambia el contrato backend.
