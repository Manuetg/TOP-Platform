# TOP — Frontend Backlog

Última actualización: 2026-09-18

## Objetivo

Este documento define el backlog funcional del frontend de TOP Platform.

El frontend debe consumir los contratos expuestos por el backend sin duplicar reglas de negocio.

Las reglas de negocio continúan siendo responsabilidad del backend y de la documentación oficial del dominio.

---

# 1. Principios de implementación

- React + TypeScript + Vite.
- Arquitectura por features.
- Mobile-first.
- No duplicar reglas de negocio del backend.
- Todo acceso a API debe pasar por una capa compartida.
- Todo flujo debe contemplar estados:
  - loading;
  - success;
  - empty;
  - error.
- Toda funcionalidad debe respetar aislamiento por Business.
- No almacenar secretos en el frontend.
- No versionar `.env.local`.
- Mantener compatibilidad con los contratos Swagger actuales.
- Si backend cambia un contrato consumido por frontend, registrar el impacto en `docs/00-Current-Status.md`.

---

# 2. Estados posibles

- `Completed`
- `In Progress`
- `Planned`
- `Blocked`

---

# 3. Estado general

Total historias frontend activas: 51

Estado actual:

- Completed: 43
- In Progress: 1
- Planned: 6
- Blocked: 1

Recuento por estados reales: 43 + 1 + 6 + 1 = 51. FE-AVL-002 permanece como un registro histórico «Reubicado a Calendar» y se excluye del total activo para no duplicar trabajo.

---

# 4. FE-FND — Frontend Foundation

## FE-FND-001 — Frontend Project Foundation

Estado: Completed

Objetivo:

Establecer la base técnica del frontend TOP.

Incluye:

- React.
- TypeScript.
- Vite.
- estructura `app/features/shared`.
- TanStack Query Provider.
- Vitest.
- Testing Library.
- oxlint.
- variables de entorno.
- build productivo.
- configuración de puerto 3001.
- fuente Plus Jakarta Sans.

Criterios de aceptación:

- `npm run build` pasa.
- `npm run lint` pasa.
- `npm run test` pasa.
- no se versiona `node_modules`.
- no se versiona `dist`.
- no se versiona `.env.local`.

---

## FE-FND-002 — Shared UI Foundation

Estado: Completed

Objetivo:

Establecer componentes UI reutilizables alineados con la identidad visual TOP.

Implementado:

- Button;
- Input;
- Badge;
- design tokens iniciales;
- Plus Jakarta Sans;
- estados hover, active, focus y disabled;
- soporte de `prefers-reduced-motion`;
- accesibilidad básica en controles;
- tests de Button, Input y Badge.

Criterios de aceptación:

- componentes reutilizables;
- estilos consistentes;
- responsive;
- accesibilidad básica;
- tests en componentes críticos.

---

## FE-FND-003 — API Client Foundation

Estado: Completed (efectivo en `develop` al mergear PR #81)

Objetivo:

Centralizar las llamadas HTTP al backend.

Implementado:

- `apiRequest<T>()`;
- `ApiError`;
- `VITE_API_URL`;
- interpretación común de errores HTTP para la respuesta inicial y el retry;
- validación runtime del mensaje contractual `string | string[]`, conservando `status` y los mensajes funcionales;
- fallback seguro para cuerpos ausentes, inválidos o no JSON, y respuestas `5xx` sin exponer detalles internos;
- `ApiTransportError` para fallos de transporte sin respuesta y `ApiResponseError` para JSON inválido en una respuesta exitosa, sin inventar un status HTTP;
- soporte opcional de `Authorization: Bearer`;
- preservación de headers personalizados;
- soporte de respuestas `204`;
- recuperación centralizada de requests autenticados que reciben `401`;
- integración con refresh token rotatorio, single-flight y reutilización del access token vigente ante respuestas tardías;
- máximo un retry y prevención de loops de refresh;
- conexión automática con la sesión autenticada;
- preservación de `AbortError` y `signal`, incluso durante fetch, lectura de cuerpo y espera de recuperación; una cancelación no reemite el request ni cancela el refresh compartido;
- tests del cliente para contrato HTTP, retry, errores de transporte y formato, cancelaciones y regresiones de headers, `Idempotency-Key`, `FormData`, 204 y autenticación.
- Evidencia del código funcional en HEAD `a39668f38b3ca62c93c2e922f1a083e9e8aa5db7`: Frontend CI run `35386101873` — Node `v22.23.2`, build PASS, 64 archivos y 296 tests PASS, lint PASS (207 archivos, 0 warnings/errores); Backend CI run `35386101857` — SUCCESS.
- El HEAD documental previo `c79f356bf52855151a1aaae219c3ef3e80455c60` de PR #81 también pasó Frontend CI run `35386641151` y Backend CI run `35386640936`; Mutation `SKIPPED` según el workflow.
- QA manual de navegador/backend: NOT RUN.

Pendiente:

- UX global del shell ante fallos de renderizado y errores de aplicación; responsabilidad de FE-FND-004, fuera del alcance de esta historia.

Criterios de aceptación:

- ninguna feature hace `fetch` directo;
- errores tipados;
- soporte autenticación;
- soporte respuestas 204;
- configuración mediante entorno.

---

## FE-FND-004 — Application Routing & Layout Foundation

Estado: Completed (efectivo en `develop` al mergear PR #82)

Objetivo:

Definir routing y estructura visual base de la aplicación.

Implementado:

- React Router;
- `/login`;
- redirect `/ → /login`;
- ruta catch-all `*`;
- pantalla 404 responsive y accesible;
- navegación desde 404 hacia `/login`;
- App Shell responsive base;
- sidebar persistente en desktop;
- contexto de Business activo visible;
- navegación agrupada por Operación y Gestión;
- navegación inferior mobile con Inicio, Calendario, Reservas y Más;
- estado activo accesible y responsive.
- navegación real del App Shell conectada a React Router;
- rutas `/app` y secciones operativas/gestión;
- soporte de deep links por sección;
- sincronización del estado activo con la URL.
- menú/flujo de `Más` en mobile;
- `ProtectedRoute` y `PublicRoute` integrados con los estados `restoring`, `authenticated` y `unauthenticated`;
- redirección anónima al login sin montar contenido privado;
- redirección de sesiones autenticadas fuera de `/login`;
- preservación segura de deep links internos bajo `/app`;
- integración con Active Business Context y Business real visible en el layout;

Validación y alcance de recuperación:

Arquitectura de captura y recuperación (FE-FND-004):

- `PageErrorBoundary` captura errores inesperados de renderizado del `Outlet`, dentro de `BusinessBoundary`, `AppShell` y `ProtectedRoute`. Conserva navegación, cuenta y providers Query → Auth → Business. Reintentar remonta únicamente el contenido fallido; navegar a `/app` o a otra sección permite continuar.
- La clave de recuperación cambia con la ubicación, identidad y Business activo; no remonta contenido sano por un cambio de clave. Un fallo persistente conserva el fallback hasta otra acción explícita, sin bucles, logout, limpieza de cache ni reproducción de mutations.
- El `errorElement` raíz del router de datos cubre fallos del shell y routing. Sustituye el árbol de rutas por un respaldo neutral, sin intentar renderizar AppShell y sin consumir Auth/Business. Los providers siguen por encima del router. Inicio usa navegación de documento a `/app`, que vuelve a pasar por autenticación; Recargar aplicación realiza una recarga explícita.
- Un `ErrorBoundary` exterior en App cubre fallos de renderizado de los providers/RouterProvider. Su fallback funciona sin router ni providers; la recuperación es de documento, sin reinicios automáticos en memoria.
- Alcance real: errores del render/árbol React cubierto y errores propagados por el router de datos. No intercepta por sí solo eventos, promesas arbitrarias, código fuera de React ni errores de arranque anteriores al montaje. No usa listeners globales ni telemetry.
- FE-FND-003 conserva el manejo de validación, 403, 409, recursos ausentes, queries y cancelaciones en cada feature. No cambian retries ni `throwOnError`; Business empty/selection-required siguen siendo estados normales.
- Fallbacks con mensajes fijos, sin datos del error, anuncio accesible, foco en el encabezado, acciones semánticas y estilos responsive con tokens TOP.
- Pruebas sobre `appRoutes` compartido con AppRouter: aislamiento de página, shell fallido, navegación/reintento, fallo persistente, no repetición de mutation, sesión anónima/restoring/pérdida, Business, errores locales, cancelación y 404. Pruebas adicionales de cambio de identidad/Business y respaldo sin contextos.
- Referencias oficiales: [React: Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) y [React Router 7.18.2: Data Mode](https://github.com/remix-run/react-router/blob/react-router%407.18.2/docs/how-to/error-boundary.md). Sin nuevas dependencias ni cambio de modo del router.
- Evidencia: Frontend CI `35473054747` SUCCESS (Node `v22.23.2`, build, 67 archivos/317 tests, lint sin advertencias ni errores); Backend CI `35473054790` SUCCESS. Validaron el feature HEAD `a186027c53331d27987bbcab228070d7a1ef8455`; checkout frontend `1dc6bc075683c3b1f7e274d84a8fa7bf010c53b9`, merge sintético de CI, no merge definitivo. El primer run `35472962069` detectó un error de tipado del helper de rutas de tests, corregido sin relajar configuración. HEAD final documental y checkout final: evidencia en el cuerpo de PR #82, sin commits recursivos por SHA.
- Self-review documentada: sin hallazgos bloqueantes en alcance, jerarquía de captura, protección privada, aislamiento, mensajes, accesibilidad básica y ausencia de mutaciones en recuperación. `git diff --check` PASS. QA manual móvil/desktop: NOT RUN; no se afirma validación visual ni de navegador. Mutation: NOT RUN, diferida al quality gate preproducción. Sin cambios backend, nuevas dependencias ni modificaciones al trabajo de Manu.

Criterios de aceptación:

- rutas públicas y privadas diferenciadas;
- navegación coherente;
- no acceso a pantallas privadas sin sesión válida.

---

## FE-FND-005 — Global App Header

Estado: Completed

Objetivo:

Evolucionar el shell con una barra superior global que concentre contexto y acciones de alto uso.

Debe contemplar:

- Business activo con nombre e imagen;
- acceso al selector de Business cuando corresponda;
- búsqueda global;
- perfil del usuario con avatar;
- acceso a acciones de cuenta;
- adaptación responsive.

Criterios de aceptación:

- el Business activo permanece claramente identificable;
- el header no duplica navegación innecesaria;
- búsqueda y perfil son accesibles;
- mobile conserva una composición compacta;
- datos reales provienen de los contextos correspondientes.

---

## FE-FND-006 — Desktop Context Rail

Estado: Planned

Objetivo:

Incorporar un panel contextual secundario en desktop para información útil sin saturar el contenido principal.

Puede incluir:

- Next Steps;
- actividad reciente;
- vistos recientemente;
- recomendaciones de configuración;
- ayudas contextuales;
- futuras oportunidades de upgrade.

Criterios de aceptación:

- no reduce excesivamente el área operativa principal;
- desaparece o se recompone en tablet/mobile;
- contenido contextual reutilizable;
- no mezcla responsabilidades con la navegación principal.

FE-DSH-001 implementa la composición visual del Dashboard; el alcance transversal del rail permanece en Foundation.

---

## FE-FND-007 — Interaction & Motion System

Estado: Planned

Objetivo:

Definir un sistema consistente de microinteracciones y movimiento que refuerce la percepción de calidad del producto.

Debe contemplar:

- motion tokens;
- hover;
- pressed/active;
- elevación;
- transiciones de panels y menus;
- feedback visual de interacción;
- `prefers-reduced-motion`.

Criterios de aceptación:

- animaciones sutiles y consistentes;
- ninguna animación bloquea interacción;
- no se utilizan movimientos decorativos innecesarios;
- accesibilidad de movimiento respetada;
- patrones reutilizables en toda la aplicación.

---

## FE-FND-008 — Visual Surface & Button Polish

Estado: Planned

Objetivo:

Elevar la calidad visual de los componentes base y superficies de TOP.

Debe contemplar:

- variantes de Button consistentes;
- tamaños `sm`, `md` y `lg` cuando sean necesarios;
- icon buttons;
- estados hover, focus, pressed y disabled;
- sombras/elevation;
- cards;
- panels;
- borders y surfaces coherentes;
- uso consistente de tokens.

Criterios de aceptación:

- componentes no parecen controles browser genéricos;
- no se duplican estilos por feature;
- cumple accesibilidad de foco y contraste;
- visualmente consistente en toda la plataforma.

---


## FE-FND-009 — Global Search

Estado: In Progress

Objetivo:

Convertir la búsqueda global del App Header en un punto de acceso unificado a módulos y entidades del Business activo.

Debe contemplar:

- módulos de navegación;
- Resources por nombre e `internalCode`;
- Contacts por nombre y otros campos permitidos por backend;
- Bookings por identificadores y datos buscables soportados;
- agrupación de resultados por tipo;
- navegación al detalle correspondiente;
- debounce de consultas;
- estados loading, empty y error;
- aislamiento estricto por Business activo.

Arquitectura esperada:

- frontend no debe descargar datasets completos para realizar la búsqueda;
- backend debe ser fuente de verdad para búsqueda de entidades;
- preferir un endpoint de búsqueda global scoped al Business;
- resultados deben devolver tipo, identificador, título y contexto suficiente para navegación.

Ejemplo conceptual:

`GET /api/businesses/{businessId}/search?q={query}`

Fuera de alcance:

- definir índices o implementación interna de búsqueda del backend;
- búsqueda entre Businesses sin autorización;
- resultados de entidades para las que el usuario no tenga acceso.

Criterios de aceptación:

- buscar `Cabaña 1` puede devolver el Resource correspondiente;
- buscar un Contact puede devolver su ficha;
- módulos continúan apareciendo como resultados;
- resultados están agrupados y diferenciados visualmente;
- seleccionar un resultado navega al destino correcto;
- búsqueda respeta Business y permisos;
- no se duplican reglas de negocio en frontend.


Mínimo C aprobado por Rolo — implementación en esta misma historia:

- Backend expresamente autorizado como dependencia inseparable; extensión FE-FND-009 sobre el baseline histórico backend 53/53, sin nueva épica ni modificación de los contratos de listado/detalle existentes.
- `GET /api/businesses/:businessId/search?q=...`, autenticado, `Cache-Control: no-store`, Business ACTIVE; `q` string único, trim, 2–120 caracteres. Parámetros inválidos 400; falta de acceso 403; negocio ausente 404 e inactivo 409.
- `search.read` para los cuatro roles; resolución de membresía vigente y policy existente por cada grupo (`resource.read`, `contact.read`, `booking.read`). Grupos denegados omitidos y no consultados, sin señales de existencia.
- Resources por name/internalCode y Contacts por name/lastName/phone/whatsapp/email/documentNumber: coincidencia parcial literal e insensible a mayúsculas, sin normalización avanzada. Escape de `%`, `_` y barra inversa; filtros parametrizados, tenant y límite en PostgreSQL. Orden existente, hasta seis filas para entregar cinco y `hasMore`, sin COUNT ni filtro nuevo de estados.
- Bookings solo por UUID completo exacto dentro del Business, máximo uno y `hasMore: false`; no hay numeración comercial, búsqueda por relaciones ni UUID parcial. Identificador ajeno/inexistente produce grupo vacío. Subtitle usa fechas puras existentes separadas por ` → `; sin fechas es null.
- DTO mínimo por item: type/id/title/subtitle/status; Contact no expone documento en resultados. Consultas concurrentes autorizadas; un fallo técnico invalida todo el bloque remoto.
- Frontend: módulos inmediatos, entidades con debounce 250 ms, query key por usuario/Business/consulta y signal hasta `apiRequest`. Sin retries automáticos, sin datos anteriores durante debounce; cierre/cambio de contexto cancela solo Search. Se conserva recovery 401 y refresh compartido.
- Combobox/listbox con grupos, opciones estables por ID, flechas/Enter/Escape, Tab sin trampa, anuncios y foco tras navegación. Las reservas indican UUID completo. Truncamiento ofrece abrir módulo sin prometer filtros.
- Tests escritos: HTTP y policy reales con lectores controlados; lectores sobre PostgreSQL; aceptación de composición; frontend con QueryClient y fetch controlado. No equivalen a QA de navegador. La ejecución de build/lint/tests corresponde exclusivamente a GitHub CI. Runs, feature HEAD y checkout sintético comprobados se registran en la [PR #83](https://github.com/Manuetg/TOP-Platform/pull/83), que permanece en borrador; no existe merge definitivo. QA manual móvil/desktop NOT RUN; mutation diferida.
- Corrección de foco del reintento: devuelve el foco al input antes de iniciar la petición y conserva consulta/panel; Escape desde el botón cierra sin reapertura por onFocus. Sin efectos al finalizar peticiones. Pruebas con foco real mediante user-event, respuestas diferidas, éxito/error, flechas/Enter, Tab/Shift+Tab y cierre/contexto/salida sin recuperación tardía ni peticiones duplicadas.
- QA de esta corrección: móvil/desktop NOT RUN; inspección de puertos sin frontend/API escuchando en localhost:3001/3000. Navegador y viewport: no ejecutados. No se levantan servicios ni builds locales; pendiente reintento, teclado/foco, selección, tacto y desplazamiento en navegador real.
- Self-review del implementador: alcance, contrato, aislamiento, cancelación, teclado y diff revisados; no equivale a revisión independiente. Se mantiene In Progress: falta QA de navegador y revisión para cierre por DoD. No se declara Completed ni se inicia otra historia.

---

## FE-FND-010 — Frontend Containerization

Estado: Completed

Objetivo:

Containerizar el frontend de TOP para disponer de un runtime reproducible y alineado con el stack Docker local de la plataforma.

Implementado:

- Dockerfile multi-stage;
- build productivo con Node 22;
- runtime estático con Nginx;
- configuración de `VITE_API_URL` mediante build argument;
- SPA fallback hacia `index.html`;
- endpoint `/health`;
- healthcheck Docker;
- `.dockerignore`;
- integración del frontend al Docker Compose existente;
- exposición del frontend en `localhost:3001`;
- integración con API en `localhost:3000`;
- validación end-to-end con login y Resources.

Arquitectura local:

- PostgreSQL: `localhost:5432`;
- API: `localhost:3000`;
- Frontend: `localhost:3001`.

Criterios de aceptación:

- `npm run test` pasa;
- `npm run build` pasa;
- `npm run lint` pasa;
- imagen Docker frontend construye correctamente;
- Nginx responde `200` en `/`;
- `/health` responde `200`;
- deep links SPA no devuelven `404`;
- frontend consume correctamente el API desde el navegador;
- stack PostgreSQL + API + frontend puede levantarse mediante Docker Compose;
- login y Resources funcionan desde el frontend containerizado.

---
# 5. FE-IAM — Identity & Session

## FE-IAM-001 — Login

Estado: Completed

Objetivo:

Permitir que un usuario inicie sesión con credenciales válidas.

Implementado:

- formulario con React Hook Form y Zod, campos requeridos y formato de correo validado;
- `POST /api/auth/login` mediante `apiRequest`, con el body contractual y sin reutilizar credenciales de una sesión previa;
- sesión autenticada establecida en `AuthProvider` al recibir una respuesta válida;
- `PublicRoute` realiza la única navegación post-login, usando el resolver seguro compartido para `next` y el fallback `/app`;
- loading visible como «Ingresando...» y control que deshabilita la acción mientras espera;
- bloqueo de envíos concurrentes incluso si llega otro evento submit mientras la petición sigue pendiente;
- mensajes comprensibles para credenciales inválidas (401), usuario deshabilitado (403), solicitud rechazada (400) y fallos de red/servidor;
- errores no establecen sesión ni navegan al área privada; el usuario puede corregir y volver a intentar;
- sin logs de credenciales ni tokens.

Origen del trabajo:

- establecimiento de sesión y navegación post-login segura ya estaban implementados y probados en PR #79;
- esta PR completa validación del formulario, estados de envío, prevención de duplicados, manejo y recuperación de errores y cobertura del cliente API.

Pruebas:

- validación de campos requeridos y correo inválido, incluyendo asociación accesible del error;
- loading, botón deshabilitado y un solo request ante submits concurrentes;
- mensajes 400/401/403/5xx y error de red, sin sesión ni navegación tras rechazo;
- reintento exitoso después de corregir credenciales y limpieza del error anterior;
- contrato del cliente: endpoint, POST, body, propagación de error y ausencia de Bearer previo;
- el API client no intenta refresh automático ante 401 de `/auth/login`;
- se conservan las pruebas de establecimiento de sesión, deep link y fallback seguro de PR #79.

Evidencia de cierre:

- el cierre documental se prepara en la rama `feature/fe-iam-001-complete-login` y es efectivo en `develop` al merge de su PR;
- Frontend CI `35382260589` — SUCCESS sobre el feature HEAD `bd6e6b00e0f0160a3c61641ce322d9428201ffb4`: Node `v22.23.2`, npm `11.19.1`, 64 archivos y 273 tests PASS, lint con 0 warnings/0 errores y build PASS;
- Backend CI `35382260648` — SUCCESS para la PR; mutation `SKIPPED` por política. Backend y contratos permanecen sin cambios;
- no se ejecutaron suites locales; los workflows de GitHub ejecutaron build, tests y lint;
- QA manual de navegador: `NOT RUN`; la cobertura automatizada no se presenta como validación contra backend, PostgreSQL o Nginx reales.

Criterios de aceptación:

- credenciales válidas crean sesión;
- credenciales inválidas muestran error;
- usuario deshabilitado muestra error;
- loading visible;
- al finalizar correctamente se accede a la aplicación.

---

## FE-IAM-002 — Authenticated Session State

Estado: Completed

Objetivo:

Mantener en memoria el estado del usuario autenticado durante el uso actual de la aplicación.

Implementado:

- estado de sesión centralizado mediante `AuthProvider`;
- access token;
- refresh token;
- usuario autenticado;
- memberships;
- estado autenticado/no autenticado;
- integración del login con el estado de sesión;
- tests del estado inicial y establecimiento de sesión.

Fuera de alcance:

- persistencia entre recargas — FE-IAM-003;
- rotación de refresh token — FE-IAM-004;
- logout — FE-IAM-005;
- protected routes — FE-IAM-006;
- Business activo — FE-BUS-001;
- Authorization Bearer en API client — FE-FND-003.

Criterios de aceptación:

- existe una única fuente de estado de autenticación;
- la sesión devuelta por login queda disponible globalmente;
- access token, refresh token, usuario y memberships quedan disponibles en memoria;
- el estado distingue usuario autenticado y no autenticado;
- no se implementa persistencia ni lógica de refresh en esta historia.

---

## FE-IAM-003 — Session Persistence

Estado: Completed

Objetivo:

Restaurar una sesión válida al recargar el navegador.

Criterios de aceptación:

- reload no obliga a loguearse si la sesión puede renovarse;
- sesión inválida vuelve a login;
- no se expone información sensible innecesaria.

---

## FE-IAM-004 — Refresh Token Rotation

Estado: Completed

Objetivo:

Renovar la sesión mediante backend sin intervención del usuario.

Endpoint backend:

- `POST /api/auth/refresh`

Criterios de aceptación:

- se usa el nuevo refresh token devuelto;
- el token anterior deja de utilizarse;
- no se crean loops infinitos;
- ante refresh inválido se limpia sesión.

---

## FE-IAM-005 — Logout

Estado: Completed

Objetivo:

Cerrar la sesión de forma consistente.

Endpoint backend:

- `POST /api/auth/logout`

Criterios de aceptación:

- backend recibe refresh token;
- sesión local se limpia;
- usuario vuelve a `/login`;
- logout repetido no rompe UI.

Implementado:

- `POST /api/auth/logout` con el refresh token rotado vigente;
- revocación remota best effort y cierre local autoritativo;
- limpieza inmediata de sesión, snapshot `sessionStorage` y QueryClient;
- navegación a `/login` desde el App Layout;
- protección ante doble ejecución, refresh concurrente y respuestas `401` tardías;
- acción accesible en el menú de perfil desktop/mobile;
- tests de API, sesión, cache, error remoto y carreras asíncronas.

Evidencia:

- implementación inicial: PR #72;
- cierre funcional, tests y documentación: PR de esta historia;
- Node 22: 59 archivos y 225 tests PASS;
- `npm run lint`: PASS;
- `npm run build`: PASS;
- backend sin cambios.

---

## FE-IAM-006 — Protected Routes

Estado: Completed

Objetivo:

Impedir acceso a pantallas privadas sin sesión válida.

Criterios de aceptación:

- usuario anónimo es redirigido a login;
- usuario autenticado no vuelve a login salvo logout/expiración;
- refresh de navegador conserva comportamiento correcto.

Implementado:

- guard central del árbol `/app` basado exclusivamente en AuthContext;
- estado accesible durante `restoring`, sin montar Login ni páginas privadas;
- redirección anónima con `replace` y preservación de `pathname`, query y hash;
- destino post-login validado y normalizado, limitado a `/app` y sus rutas hijas;
- rechazo de URLs externas, esquemas, prefijos ambiguos, barras invertidas y traversal literal o codificado;
- una única decisión de navegación post-login en `PublicRoute`, sin navegación competidora desde `LoginPage`;
- pérdida de sesión retira el contenido privado y mantiene el guard al navegar hacia atrás;
- estados `empty` y `selection-required` de Business permanecen dentro del flujo autenticado.

Evidencia:

- implementación original: PR #73, merge `d2d2018f255d34a3d25184c8cc2bb4640ff35def`;
- correcciones y pruebas: PR #79;
- Frontend CI `35378595452`: Node `v22.23.2`, build PASS, 63 archivos/261 tests PASS y lint PASS sobre `63307c2190a15b0fc5e9cd79c230294fb5b3261c`;
- pruebas de componentes/integración cubren restoring, anonimato, sesiones autenticadas, deep links, login, pérdida de sesión y BusinessBoundary;
- QA manual de navegador: `NOT RUN`; permanece visible como validación pendiente y no se sustituye por MemoryRouter;
- el cierre queda efectivo en `develop` al mergear esta PR.

---

# 6. FE-BUS — Business Context

## FE-BUS-001 — Active Business Context

Estado: Completed

Objetivo:

Mantener un Business activo para operaciones multi-tenant.

Criterios de aceptación:

- business activo accesible globalmente;
- APIs privadas usan el `businessId` correcto;
- un solo membership selecciona automáticamente el Business.

---

## FE-BUS-002 — Business Selector

Estado: Planned

Objetivo:

Permitir seleccionar el Business activo cuando el usuario pertenece a más de uno.

Criterios de aceptación:

- lista memberships disponibles;
- cambio de Business actualiza contexto;
- datos anteriores no quedan mezclados.

---

## FE-BUS-003 — Business Profile

Estado: Planned

Objetivo:

Mostrar y editar la información principal del establecimiento según permisos y contrato backend.

Criterios de aceptación:

- muestra datos actuales;
- edición usa backend;
- errores se muestran correctamente;
- no duplica reglas de negocio.

---

# 7. FE-RES — Resources

## FE-RES-001 — Resource List

Estado: Completed

Objetivo:

Mostrar y gestionar visualmente las cabañas, habitaciones o unidades del Business con calidad cercana a producción.

Debe mostrar como mínimo:

- nombre;
- `internalCode`;
- capacidad;
- estado;
- amenities principales cuando existan;
- imagen del Resource o fallback visual TOP cuando corresponda;
- acciones disponibles según las historias implementadas.

Debe contemplar:

- loading state;
- empty state con CTA;
- error state y retry;
- success state;
- diseño responsive mobile/tablet/desktop;
- jerarquía visual clara;
- estados hover/focus;
- microinteracciones sutiles;
- accesibilidad básica;
- preparación visual para usage/límites de plan sin inventar reglas de negocio.

Criterios de aceptación:

- consume el contrato backend de Resources;
- no duplica reglas de negocio;
- la pantalla es usable en mobile y desktop;
- la lista tiene calidad visual cercana al producto objetivo;
- estados ACTIVE, OUT_OF_SERVICE y ARCHIVED tienen representación comprensible;
- ausencia de imagen no deja un espacio visual roto;
- tests cubren estados críticos de la pantalla.

---

## FE-RES-002 — Resource Detail

Estado: Completed

Objetivo:

Mostrar la ficha completa de una unidad.

Implementado:

- ruta `/app/resources/:resourceId`;
- consumo del detalle real del Resource;
- nombre, `internalCode` y estado;
- descripción con fallback;
- capacidad de huéspedes y niños;
- amenities asignados;
- fallback visual cuando no existe imagen disponible;
- navegación hacia atrás al listado;
- estados loading y error con retry;
- diseño responsive mobile/desktop;
- tests del API y pantalla de detalle.

Fuera de alcance:

- edición del Resource — FE-RES-004;
- transiciones operativas — FE-RES-005;
- upload y gestión de imágenes — FE-RES-006;
- gestión de amenities — FE-RES-006.
---

## FE-RES-003 — Create Resource

Estado: Completed

Objetivo:

Permitir crear una nueva unidad.

Implementado:

- ruta `/app/resources/new`;
- navegación desde el listado de Resources;
- formulario responsive mobile/desktop;
- creación real mediante `POST /api/businesses/:businessId/resources`;
- validación frontend con Zod y React Hook Form;
- nombre, descripción y capacidades;
- `internalCode` generado automáticamente a partir del nombre;
- `sortOrder` preservado como dato técnico del contrato, con valor inicial interno, sin exponerse como campo operativo al usuario;
- normalización del código interno a formato compatible con backend;
- feedback de errores;
- redirección al detalle luego de crear;
- backend continúa siendo autoridad final de reglas de negocio;
- test de integración de la capa API;
- validación visual y funcional end-to-end en entorno Docker.

Fuera de alcance:

- edición del Resource — FE-RES-004;
- transiciones operativas — FE-RES-005;
- upload y gestión de imágenes — FE-RES-006;
- gestión de amenities — FE-RES-006;
- persistencia y renovación de sesión — FE-IAM-003 / FE-IAM-004.
---

## FE-RES-004 — Edit Resource

Estado: Completed

Objetivo:

Modificar datos de una unidad existente.

Implementado:

- ruta `/app/resources/:resourceId/edit`;
- navegación a edición desde el detalle del Resource;
- carga de datos actuales del Resource;
- formulario responsive reutilizando las reglas visuales del módulo;
- edición real mediante `PATCH /api/businesses/:businessId/resources/:resourceId`;
- validación frontend con Zod y React Hook Form;
- edición de nombre, `internalCode`, descripción y capacidades;
- `sortOrder` preservado internamente durante la edición sin exponerse como campo visual;
- normalización de `internalCode` a mayúsculas antes del envío;
- manejo de errores del backend;
- actualización inmediata de la cache del detalle tras guardar;
- invalidación del listado de Resources para evitar datos desactualizados;
- navegación nuevamente al detalle después de una edición exitosa;
- test del contrato de actualización.

Fuera de alcance:

- transiciones operativas — FE-RES-005;
- upload y gestión de imágenes — FE-RES-006;
- gestión de amenities — FE-RES-006.

---

## FE-RES-005 — Resource Operational Status

Estado: Completed

Objetivo:

Mostrar y ejecutar las transiciones de estado soportadas por backend.

Implementado:

- `ACTIVE → OUT_OF_SERVICE` mediante `PATCH /api/businesses/:businessId/resources/:resourceId/disable`;
- `OUT_OF_SERVICE → ACTIVE` mediante `PATCH /api/businesses/:businessId/resources/:resourceId/reactivate`;
- transición directa mediante control semántico `switch`, sin modal de confirmación;
- estado de procesamiento durante la operación;
- manejo de errores;
- actualización inmediata de la cache del detalle;
- invalidación del listado de Resources;
- Resource `ARCHIVED` sin transiciones operacionales disponibles;
- tests de capa API y pantalla;
- validación manual en Docker.

El frontend no inventa transiciones y consume únicamente las soportadas por backend.

Criterios de aceptación:

- ACTIVE permite poner fuera de servicio;
- OUT_OF_SERVICE permite reactivar;
- ARCHIVED no ofrece transiciones operacionales;
- cambios persisten tras refresh;
- listado y detalle reflejan el estado actualizado;
- errores del backend se muestran al usuario.

---

## FE-RES-006 — Resource Images & Amenities

Estado: Completed

Objetivo:

Gestionar imágenes y amenities asignados al Resource.

Implementado — Amenities:

- catálogo cargado mediante `GET /api/businesses/:businessId/amenities`;
- soporte de amenities globales TOP y personalizados del Business;
- tipos frontend `AmenityCategory` y `scope: GLOBAL | BUSINESS`;
- cache TanStack Query aislada mediante `["amenities", businessId]`;
- reemplazo completo de asignación mediante `PUT /api/businesses/:businessId/resources/:resourceId/amenities`;
- selección y deselección de amenities desde el detalle del Resource;
- creación de amenities personalizados mediante `POST /api/businesses/:businessId/amenities`;
- selector de las diez categorías soportadas por backend;
- selección automática del amenity personalizado recién creado;
- actualización de cache del detalle e invalidación de queries relacionadas;
- estados de loading, error, retry y procesamiento;
- UI responsive integrada en el detalle del Resource;
- commit frontend `120f54f` (`feat(resources): add amenity management`);
- validación manual en Docker aprobada, incluyendo persistencia tras refresh de amenities globales y personalizados.

Implementado — Imágenes:

- lectura de imágenes persistidas mediante `GET /api/businesses/:businessId/resources/:resourceId/images`;
- URLs temporales firmadas generadas por backend, sin exponer `storageKey`;
- carga mediante `POST /api/businesses/:businessId/resources/:resourceId/images`;
- soporte frontend para JPEG, PNG y WEBP;
- límite de 5 MB por archivo y máximo de 10 imágenes reflejado en la UI;
- carga disponible también para Resources `OUT_OF_SERVICE`;
- mutaciones de imágenes deshabilitadas para Resources `ARCHIVED`;
- carrusel responsive en el detalle del Resource;
- navegación circular mediante controles anterior/siguiente;
- contador y selección visual de la imagen activa;
- selección automática de una imagen recién cargada;
- eliminación mediante `DELETE /api/businesses/:businessId/resources/:resourceId/images/:imageId`;
- confirmación previa a la eliminación;
- backend mantiene capacidad de reordenamiento mediante `PUT /api/businesses/:businessId/resources/:resourceId/images/order`;
- el refinement final del MVP no expone controles de reordenamiento en la UI; la capacidad backend queda disponible para una iteración futura;
- persistencia del orden completo de imágenes soportada por backend;
- `sortOrder = 0` utilizado como convención de portada del Resource;
- compactación del orden luego de eliminar una imagen gestionada por backend;
- actualización inmediata de cache después de upload, delete y reorder;
- fallback visual TOP cuando el Resource no posee imagen;
- imagen real en el detalle cuando existe;
- imagen de portada real en el listado de Resources cuando existe;
- comportamiento consistente de fallback entre listado y detalle.

Implementado — Portadas del listado:

- endpoint batch `GET /api/businesses/:businessId/resources/images/covers`;
- una sola consulta de portadas por Business, evitando N+1 por cada Resource;
- respuesta mínima `{ resourceId, imageId, url }`;
- solo la imagen con `sortOrder = 0` se utiliza como portada;
- firma únicamente de las URLs necesarias para el listado;
- `ResourceResponseDto` permanece libre de imágenes y de URLs temporales;
- hook TanStack Query dedicado con key `["resources", businessId, "image-covers"]`;
- asociación `resourceId → cover` construida en frontend;
- cards sin portada conservan la ilustración default TOP;
- cards con portada utilizan imagen real con `object-fit: cover`.

Decisiones técnicas:

- las URLs firmadas son temporales, por lo que las imágenes no se incorporan al contrato general de `Resource`;
- el detalle utiliza un endpoint dedicado para obtener el álbum completo;
- el listado utiliza un endpoint batch dedicado para obtener únicamente las portadas;
- no se realizan requests individuales de imágenes por cada card;
- la portada deriva del orden persistido: la primera imagen (`sortOrder = 0`) es la portada;
- no se introduce un campo adicional `isPrimary`;
- el backend continúa siendo autoridad de persistencia, límites, orden, aislamiento tenant y reglas de archivo;
- el frontend no inventa persistencia ni reglas de negocio adicionales.

Criterios de aceptación cumplidos:

- Resource con imágenes muestra contenido real persistido;
- Resource sin imágenes muestra fallback TOP;
- upload persiste y continúa disponible tras refresh;
- carrusel permite recorrer imágenes persistidas;
- imágenes pueden eliminarse;
- el orden de imágenes continúa soportado por backend, aunque el MVP final no expone controles manuales de reordenamiento;
- cuando el orden es modificado mediante el contrato backend, persiste tras refresh;
- cambiar el primer elemento cambia la portada;
- eliminación compacta correctamente el orden restante;
- listado y detalle son consistentes;
- Resources archivados no permiten mutaciones de imágenes;
- Resources fuera de servicio sí permiten gestionar imágenes;
- amenities globales y personalizados pueden asignarse;
- amenities persisten tras refresh;
- listado obtiene portadas sin patrón N+1;
- aislamiento por Business se preserva.

Validación:

- backend unit: 92/92 suites y 834/834 tests aprobados;
- backend integration: 23/23 suites y 85/85 tests aprobados contra `top_test`;
- backend `quality:check`: 129/129 suites y 1073/1073 tests aprobados;
- cobertura global backend: 97.42% lines, 92.88% branches, 97.52% functions y 97.97% statements;
- backend build aprobado;
- backend lint aprobado;
- architecture check aprobado sin violaciones: 230 módulos y 507 dependencias analizadas;
- endpoint batch validado contra PostgreSQL y MinIO reales en Docker;
- respuesta real validada con una portada por Resource, URLs firmadas y sin exposición de `storageKey`;
- reorder, delete, compactación y persistencia en MinIO validados en runtime real;
- frontend: 28/28 test files y 90/90 tests aprobados;
- frontend build productivo aprobado;
- frontend lint aprobado con 0 warnings y 0 errors;
- rebuild Docker frontend aprobado;
- validación visual del detalle aprobada;
- validación visual del listado aprobada;
- imagen real, fallback TOP y persistencia tras refresh validados manualmente.
---

## FE-RES-007 — Resource Search & Filtering

Estado: Completed

Objetivo:

Permitir localizar Resources rápidamente dentro del Business.

Implementado:

- búsqueda client-side mediante un único campo por nombre o `internalCode`;
- búsqueda case-insensitive;
- filtro por estado `ACTIVE`, `OUT_OF_SERVICE` y `ARCHIVED`;
- opción `Todos` para remover el filtro de estado;
- combinación de búsqueda textual y estado;
- contador dinámico de Resources visibles;
- acción secundaria `Limpiar` cuando existen filtros activos;
- empty state específico cuando existen Resources pero ningún resultado coincide;
- preservación del empty state original cuando el Business todavía no tiene Resources;
- controles con labels accesibles;
- layout mobile-first y adaptación desktop;
- filtrado derivado mediante `useMemo`, sin requests adicionales;
- aislamiento tenant preservado porque el filtrado opera exclusivamente sobre la lista obtenida mediante `GET /api/businesses/:businessId/resources`;
- implementación preparada para ampliar filtros sin modificar el contrato actual de carga.

Decisión técnica:

El backend actual lista Resources únicamente por `businessId` y no expone query parameters de búsqueda o filtrado. Por ese motivo FE-RES-007 implementa el filtrado en frontend sobre la colección tenant-scoped ya cargada, sin inventar contratos backend ni realizar llamadas adicionales.

Criterios de aceptación cumplidos:

- búsqueda por nombre;
- búsqueda por `internalCode`;
- filtro por estado;
- responsive;
- búsqueda accesible;
- filtros claros;
- empty state específico cuando no existen coincidencias;
- no mezcla Resources de otros Businesses;
- arquitectura extensible para filtros futuros.

Validación:

- suite específica `ResourceListPage`: 12/12 tests aprobados tras el refinement final;
- suite frontend completa: 21 test files y 64 tests aprobados;
- build productivo aprobado;
- lint aprobado con 0 warnings y 0 errors;
- `git diff --check` sin errores funcionales;
- validación manual en Docker aprobada;
- búsqueda por nombre y código interno validada manualmente;
- filtros de estado y combinación de filtros validados manualmente;
- empty state y limpieza de filtros validados manualmente;
- comportamiento responsive y foco visual revisados y aprobados.
---

### Cierre UX/UI de Resources — MVP

Refinement final aprobado para el MVP:

- `Resource List` refinado para priorizar escaneabilidad, jerarquía y densidad operativa;
- header simplificado con CTA principal `Nuevo recurso`;
- búsqueda por nombre o `internalCode` preservada;
- filtro por estado preservado sin introducir filtros no soportados por el dominio actual;
- contador dinámico de resultados preservado;
- cards desktop simplificadas con portada, nombre, capacidad máxima, estado y navegación al detalle;
- portadas reales y fallback visual TOP preservados;
- versión mobile transformada en un `Resource Story Deck` horizontal;
- navegación mobile mediante swipe nativo y `scroll-snap`;
- card activa mobile destacada mediante profundidad, escala y transición visual;
- soporte de `prefers-reduced-motion`;
- cards mobile muestran nombre, capacidad máxima, amenities principales y estado;
- `internalCode` permanece disponible en desktop pero se oculta en el Story Deck mobile para reducir ruido visual;
- amenities mobile limitados visualmente a tres elementos más contador de restantes;
- `Resource Detail` refinado con jerarquía de imagen, información, amenities y acciones;
- estado operativo representado mediante `switch` semántico;
- edición disponible desde el detalle;
- gestión de imágenes conserva upload, navegación y delete;
- reordenamiento manual de imágenes no se expone en la UI final del MVP;
- `Create Resource` y `Edit Resource` refinados como formularios compactos y consistentes;
- `sortOrder` permanece en el contrato técnico pero deja de mostrarse como campo editable;
- responsive mobile/tablet/desktop revisado;
- targets interactivos, foco y reducción de movimiento preservados conforme a los lineamientos de accesibilidad del frontend;
- no se introdujeron nuevas reglas de negocio, endpoints, permisos ni capacidades fuera del alcance existente.

Estado funcional del módulo:

**Resources se considera completo para el MVP a nivel funcional y UX/UI.**

Validación final:

- suite específica `ResourceListPage`: 12/12 tests aprobados;
- suite frontend completa aprobada;
- build productivo aprobado;
- lint aprobado sin errores;
- validación visual manual aprobada en desktop y mobile;
- navegación, filtros, imágenes, estados, Create, Edit, Detail y Story Deck mobile validados manualmente.

---
# 7A. FE-SUB — Subscription & Entitlements
## FE-SUB-001 — Subscription Entitlements & Usage UI

Estado: Planned

Objetivo:

Mostrar al usuario el plan contratado, su consumo actual y los límites funcionales disponibles.

Casos iniciales previstos:

- cantidad máxima de Resources;
- uso actual vs límite;
- proximidad al límite;
- límite alcanzado;
- CTA de upgrade.

Ejemplo conceptual:

- Plan Premium — hasta 3 Resources;
- Plan VIP — hasta 6 Resources.

Nota:

Los nombres, precios y límites definitivos de los planes son decisiones comerciales pendientes y no deben hardcodearse como reglas finales del frontend.

Criterios de aceptación:

- backend es autoridad sobre plan, entitlements y límites;
- frontend no permite asumir que ocultar/deshabilitar una acción reemplaza la validación backend;
- usage y límite se representan de forma comprensible;
- existe estado visual para límite alcanzado;
- arquitectura extensible a futuros entitlements como usuarios, almacenamiento, automatizaciones o integraciones.

---

# 8. FE-CON — Contacts

## FE-CON-001 — Contact Search/List
Estado: Completed

Objetivo:
Buscar y listar huéspedes/contactos del Business activo.

Implementado:
- listado business-scoped contra `GET /businesses/:businessId/contacts`;
- búsqueda server-side por nombre, teléfono, WhatsApp, email o documento;
- debounce de búsqueda;
- estados de loading, error, vacío y sin resultados;
- navegación a Contact Detail;
- CTA para crear un nuevo contacto;
- tabla operativa en desktop;
- cards adaptadas para mobile;
- representación visible de estado `ACTIVE`, `INACTIVE` y `ARCHIVED`.

Validación:
- probado funcionalmente en desktop y mobile;
- tests API y UI implementados;
- regresión completa de frontend aprobada con test, build y lint.

## FE-CON-002 — Contact Detail
Estado: Completed

Objetivo:
Mostrar la ficha detallada de un Contact.

Implementado:
- carga business-scoped contra `GET /businesses/:businessId/contacts/:contactId`;
- identidad y estado del contacto;
- información personal;
- documento;
- teléfono / WhatsApp;
- email;
- país y ciudad;
- estados de loading y error;
- navegación de regreso a Contact List;
- navegación a Edit Contact.

Validación:
- probado funcionalmente en desktop y mobile;
- tests UI implementados;
- regresión completa de frontend aprobada.

## FE-CON-003 — Create Contact
Estado: Completed

Objetivo:
Crear un huésped/contacto.

Implementado:
- creación business-scoped contra `POST /businesses/:businessId/contacts`;
- Nombre obligatorio;
- Apellido obligatorio;
- campo unificado `Teléfono / WhatsApp` obligatorio;
- compatibilidad con el contrato backend actual enviando el número a `phone` y `whatsapp`;
- Email opcional con validación de formato;
- Tipo de documento mediante picklist `CI` / `Pasaporte`;
- Número de documento opcional;
- País mediante picklist con navegación nativa por teclado;
- Paraguay seleccionado por defecto;
- Ciudad opcional;
- navegación automática al Contact Detail después de crear;
- formulario responsive para desktop y mobile.

Validación:
- creación real contra backend probada satisfactoriamente;
- probado funcionalmente en desktop y mobile;
- tests API y UI implementados;
- regresión completa de frontend aprobada.

## FE-CON-004 — Edit Contact
Estado: Completed

Objetivo:
Actualizar información de Contact.

Implementado:
- actualización business-scoped contra `PATCH /businesses/:businessId/contacts/:contactId`;
- precarga de los datos actuales;
- mismas reglas UX de Create Contact para Nombre, Apellido y Teléfono / WhatsApp;
- mantenimiento del campo unificado de teléfono con persistencia en `phone` y `whatsapp`;
- soporte de `CI` y `Pasaporte`;
- selección de país desde el mismo catálogo de Create;
- actualización de email, documento, país y ciudad;
- navegación al Contact Detail después de guardar;
- estados de loading y error;
- formulario responsive para desktop y mobile.

Validación:
- actualización real contra backend probada satisfactoriamente;
- probado funcionalmente en desktop y mobile;
- tests API y UI implementados;
- regresión completa de frontend aprobada.
# 9. FE-AVL — Availability

## FE-AVL-001 — Availability Check

Estado: Completed

Objetivo:

Consultar disponibilidad de un Resource para un rango de fechas.

Implementado:

- consulta business-scoped contra `GET /businesses/:businessId/availability`;
- selector de Resource reutilizando el catálogo real de Resources;
- selección de fecha de entrada y salida;
- validación de rango antes de consultar;
- representación de `AVAILABLE` y `UNAVAILABLE`;
- representación textual de razones:
  - `RESOURCE_OUT_OF_SERVICE`;
  - `RESOURCE_ARCHIVED`;
  - `BOOKING_CONFLICT`;
  - `BLOCK_CONFLICT`;
- frontend no recalcula Availability;
- el backend permanece como fuente de verdad;
- cambio de Resource o fechas invalida visualmente el resultado anterior;
- responsive desktop/mobile;
- estados inicial, loading y error.

Validación:

- probado funcionalmente contra backend real;
- probado en desktop y mobile;
- tests API y UI implementados;
- regresión completa de frontend aprobada con test, build y lint.

---

## FE-AVL-002 — Availability Calendar

Estado: Completed — implementado en Calendar

Objetivo:

Ofrecer una vista operativa de Calendario que componga Availability, Resources, Bookings y Blocks sin duplicar reglas de dominio en frontend.

Ruta:

`/app/calendar`

Contrato backend principal:

`GET /businesses/:businessId/availability/calendar`

Implementado:

- Calendar como área operativa visible, separado conceptualmente de la pantalla de consulta puntual de Availability;
- consumo business-scoped del endpoint `availability/calendar`;
- backend permanece como fuente de verdad para disponibilidad;
- integración contextual con catálogo real de Resources;
- integración visual con Bookings reales;
- integración visual con Blocks reales;
- rango mensual obtenido sin recalcular Availability en frontend;
- navegación mediante selectores independientes de mes y año;
- acción `Hoy`;
- vista desktop/tablet mediante matriz `Resource × día`;
- estado visual de reservas confirmadas, pendientes, en estadía, finalizadas y bloqueos;
- celdas libres permiten iniciar una nueva reserva;
- vista mobile específica de calendario mensual de 7 columnas, sin reutilizar la matriz horizontal desktop;
- indicadores compactos de reservas y bloqueos en mobile;
- agenda del día seleccionado debajo del calendario mobile;
- navegación desde una reserva de la agenda hacia Booking Detail;
- wizard contextual de nueva reserva en 5 pasos;
- fecha de entrada con salida automática inicial de `+1 día`;
- presentación de fechas operativas en formato `dd-mm-yyyy`;
- selección de Resource limitada por Availability real para la estadía;
- selección o creación inline de Contact;
- creación rápida de Contact con nombre, apellido, teléfono, tipo de documento y número de documento;
- tipos de documento reutilizan el contrato existente `CI` / `Pasaporte`;
- contacto recién creado queda seleccionado sin contaminar el término de búsqueda;
- contacto seleccionado no se duplica en los resultados;
- resumen consistente de documento y teléfono;
- Rate Plans obtenidos mediante selección contextual por Resource y estadía;
- único Rate Plan válido se selecciona automáticamente;
- pricing configurado mediante cálculo real del backend;
- pricing manual conserva la obligación contractual de informar un `ratePlanId`, monto acordado y motivo;
- confirmación reutiliza el flujo contractual `create → submit → confirm`;
- después de confirmar, navegación a Booking Detail;
- Blocks reciben rango RFC3339 compatible con su contrato mientras Availability Calendar conserva fechas `YYYY-MM-DD`;
- estados loading y error;
- responsive mobile/tablet/desktop;
- foco visible y controles accesibles;
- no se modificó `AppShell` como parte de esta historia;
- no se introdujeron reglas de Availability, Pricing, Booking o Block propias del frontend.

Decisiones UX aprobadas:

- desktop prioriza densidad operacional mediante matriz por alojamiento y fecha;
- mobile usa una representación mensual nativa y agenda diaria, en lugar de comprimir la matriz desktop;
- navegación temporal directa mediante Mes + Año reemplaza navegación secuencial por flechas;
- el wizard evita una acción `Atrás` inutilizable en el primer paso;
- Calendar compone módulos existentes sin convertirlos en un único dominio técnico.

Validación funcional:

- carga real del Calendar contra backend y entorno Docker;
- visualización de Resources, Bookings y Blocks verificada;
- creación completa de una Booking desde Calendar verificada end-to-end;
- pricing configurado verificado;
- pricing manual verificado;
- creación inline y selección de Contact verificada;
- comportamiento desktop validado;
- comportamiento mobile validado.

Validación técnica:

- suite específica `AvailabilityCalendarPage` aprobada;
- regresión completa de frontend aprobada;
- build productivo aprobado;
- lint aprobado sin warnings ni errores;
- `git diff --check` aprobado;
- frontend no replica el algoritmo de Availability ni las reglas autoritativas de Pricing/Booking.

Estado funcional del módulo:

**Calendar se considera completo para este alcance del MVP a nivel funcional y UX/UI.**
---

## FE-AVL-003 — Availability Rules

Estado: Completed

Objetivo:

Mostrar y editar reglas de disponibilidad del Business.

Campos implementados:

- `pendingBlocksAvailability`;
- `bufferBeforeDays`;
- `bufferAfterDays`.

Implementado:

- carga business-scoped contra `GET /businesses/:businessId/availability-rules`;
- actualización contra `PATCH /businesses/:businessId/availability-rules`;
- toggle para definir si Booking `PENDING` bloquea disponibilidad;
- edición de buffer antes;
- edición de buffer después;
- buffers validados como enteros iguales o mayores a 0;
- explicación visual del efecto de las reglas;
- aclaración de que los buffers afectan conflictos con Booking y no alteran el rango propio de Block;
- estados loading, error y confirmación de guardado;
- navegación interna `Consultar | Reglas`;
- responsive desktop/mobile;
- frontend no replica el algoritmo de Availability.

Validación:

- probado funcionalmente contra backend real;
- persistencia verificada después de recargar;
- probado en desktop y mobile;
- tests API y UI implementados;
- regresión completa de frontend aprobada con test, build y lint.

---

# 10. FE-PRI — Pricing

## FE-PRI-001 — Rate Plan List

Estado: Completed

Objetivo:

Mostrar planes tarifarios del Business.

Contrato backend disponible:

- `GET /api/businesses/{businessId}/rate-plans` con `pricing.read`;
- catálogo completo del Business, incluidos planes `ACTIVE` y `ARCHIVED`;
- selección para Booking mediante `resourceId + checkIn + checkOut`, que devuelve únicamente planes utilizables según backend;
- Rate Plan Detail diferido para el MVP.

---

## FE-PRI-002 — Create Rate Plan

Estado: Completed

Objetivo:

Crear un Rate Plan y asignarlo a Resources.

---

## FE-PRI-003 — Edit Rate Plan

Estado: Completed

Objetivo:

Editar información y asignaciones de Rate Plan.

---

## FE-PRI-004 — Seasonal Rates

Estado: Completed

Objetivo:

Gestionar tarifas estacionales.

---

## FE-PRI-005 — Price Preview

Estado: Completed

Objetivo:

Consultar el precio calculado por backend para Resource + fechas.

Criterios de aceptación:

- usa endpoint calculate;
- muestra noches;
- muestra total;
- muestra moneda;
- muestra breakdown si está disponible;
- frontend nunca calcula el precio definitivo.


### Cierre Pricing MVP

Estado: Completed

Pricing MVP cerrado en frontend con:

- catálogo de Rate Plans por Business;
- búsqueda y filtro por estado;
- creación y edición de Rate Plans;
- asignación múltiple de alojamientos sin exponer códigos internos;
- Seasonal Rates con validación de vigencia y solapamiento;
- cálculo de precio por alojamiento y estadía;
- desglose nocturno BASE / SEASONAL;
- selección contextual de Rate Plans para Booking;
- responsive desktop/mobile;
- Story Deck mobile consistente con Resources;
- cards de tamaño uniforme en desktop y mobile;
- estados loading, error y empty;
- copy de UI sin referencias técnicas innecesarias al backend;
- build, lint y pruebas del frontend validados.

---

# 11. FE-BKG — Booking

## FE-BKG-001 — Booking List

Estado: Completed

Objetivo:

Mostrar reservas del Business con filtros y estados.

Implementado:

- listado real por Business;
- filtros contractuales por estado, contacto y Resource;
- búsqueda local sobre los datos recuperados;
- resolución de nombres de Contact y Resource;
- estados loading, error y empty;
- tabla desktop y cards mobile;
- navegación a Detail y Create.

Nota:

- no se agregaron filtros de fechas al request porque el contrato backend de listado no los expone.

---

## FE-BKG-002 — Booking Detail

Estado: Completed

Objetivo:

Mostrar una reserva específica.

Endpoint relevante:

- `GET /api/businesses/{businessId}/bookings/{bookingId}`

Implementado:

- estado real de Booking;
- contacto;
- alojamiento;
- fechas;
- ocupación;
- notas;
- metadatos;
- estados incompletos de DRAFT sin inventar datos;
- acciones de lifecycle condicionadas por estado.

---

## FE-BKG-003 — Create Draft Booking

Estado: Completed

Objetivo:

Crear una Booking en estado DRAFT.

Implementado:

- Contact opcional;
- un único Resource opcional;
- check-in y check-out opcionales;
- adultos y niños opcionales;
- notas opcionales;
- persistencia de DRAFT incompleto;
- validación de rango de fechas;
- validación de enteros no negativos;
- validación de capacidad total;
- validación de capacidad máxima de niños;
- Resources ARCHIVED excluidos del selector.

Reglas MVP:

- una Booking admite como máximo un Resource;
- `adults + children` no puede superar `Resource.capacityMaximum`;
- `children` no puede superar `Resource.capacityMaximumChildren`;
- el contrato backend conserva `resourceIds: string[]`, con máximo un elemento.

---

## FE-BKG-004 — Edit Draft Booking

Estado: Completed

Objetivo:

Editar una Booking mientras backend permita su modificación.

Implementado:

- edición disponible únicamente para DRAFT;
- formulario compartido con Create;
- precarga de valores actuales;
- mismas reglas de Resource único, fechas y capacidad;
- acceso directo a `/edit` bloqueado para estados no editables.

---

## FE-BKG-005 — Submit Booking

Estado: Completed

Objetivo:

Ejecutar transición DRAFT → PENDING.

Endpoint:

- `POST /api/businesses/{businessId}/bookings/{bookingId}/submit`

Implementado:

- acción disponible sólo en DRAFT;
- backend decide validez;
- Submit exige exactamente un Resource;
- capacidad validada por backend;
- Availability validada por backend;
- conflictos conservan la Booking en DRAFT;
- estado actualizado a PENDING tras éxito;
- frontend no propone reasignaciones ni fechas alternativas.

---

## FE-BKG-006 — Confirm Booking

Estado: Completed

Objetivo:

Ejecutar transición PENDING → CONFIRMED.

Endpoint:

- `POST /api/businesses/{businessId}/bookings/{bookingId}/confirm`

Dependencia contractual:

- Confirm requiere `pricing[]` con `resourceId` y `ratePlanId`;
- Booking MVP es single-resource;
- `GET /api/businesses/{businessId}/rate-plans?resourceId=...&checkIn=...&checkOut=...` devuelve únicamente Rate Plans seleccionables;
- frontend no decide por su cuenta estado, asignación ni vigencia del Rate Plan;
- PricingSnapshot permanece interno y no es necesario para completar Confirm.

Contrato backend resuelto:

- GET de Rate Plans general y contextual;
- reglas de seleccionabilidad autoritativas en backend;
- Rate Plan Detail diferido;
- PricingSnapshot no expuesto mediante Booking Detail en el MVP.

---

## FE-BKG-007 — Cancel Booking

Estado: Completed

Objetivo:

Cancelar una reserva cuando backend lo permita.

Endpoint:

- `POST /api/businesses/{businessId}/bookings/{bookingId}/cancel`

Implementado:

- disponible para DRAFT, PENDING y CONFIRMED;
- motivo opcional;
- cuando se informa, debe tener entre 2 y 500 caracteres;
- resultado CANCELLED;
- no existe hard delete;
- la reserva y su historial permanecen visibles.

---

## FE-BKG-008 — Booking Timeline

Estado: Completed

Objetivo:

Mostrar la cronología contractual real de la reserva.

Endpoint:

- `GET /api/businesses/{businessId}/bookings/{bookingId}/timeline`

Eventos soportados actualmente:

- `BOOKING_CREATED`;
- `BOOKING_SUBMITTED`;
- `BOOKING_CONFIRMED`;
- `BOOKING_CANCELLED`.

Implementado:

- actor opcional;
- motivo de cancelación cuando existe;
- paginación por cursor;
- estados loading, error y empty;
- no se inventan eventos que backend no expone.

---
# 12. FE-BLK — Blocks

## FE-BLK-001 — Block List

Estado: Completed

Objetivo:

Mostrar bloqueos del Business/Resources.

Implementado:

- listado business-scoped contra `GET /businesses/:businessId/blocks`;
- filtro por Resource usando `resourceId` soportado por backend;
- filtros por fecha `from` y `to` soportados por backend;
- conversión de fechas visuales a RFC3339 antes de consultar backend;
- validación local de rango para evitar requests cuando `Hasta <= Desde`;
- filtro por `effectiveStatus` en frontend;
- filtro por `type` en frontend;
- estados operativos mostrados desde `effectiveStatus`: `SCHEDULED`, `ACTIVE`, `FINISHED`, `CANCELLED`;
- tipos soportados: `MAINTENANCE`, `OWNER_USE`, `OTHER`;
- Resource mostrado por nombre;
- estados loading, error y empty;
- tabla operativa en desktop;
- cards responsive en mobile;
- filtros colapsables en mobile y cerrados por defecto;
- indicador visual cuando existen filtros activos;
- frontend no inventa filtros backend de status/type.

Validación:

- probado funcionalmente contra backend real;
- filtros por Resource y fechas verificados;
- filtros client-side por estado y tipo verificados;
- validación de rango inválido verificada sin bloquear el módulo;
- probado en desktop y mobile;
- tests API y UI implementados.

---

## FE-BLK-002 — Create Block

Estado: Completed

Objetivo:

Crear bloqueo operativo para un Resource y rango temporal.

Implementado:

- creación contra `POST /businesses/:businessId/resources/:resourceId/blocks`;
- selección de Resource real del Business;
- Resources `ARCHIVED` excluidos del selector;
- Resources `OUT_OF_SERVICE` disponibles según contrato backend;
- tipos `MAINTENANCE`, `OWNER_USE` y `OTHER`;
- motivo obligatorio validado entre 2 y 120 caracteres;
- observaciones opcionales hasta 500 caracteres;
- inputs `datetime-local` para inicio y fin;
- conversión de fechas a RFC3339 antes de enviar;
- validación local de `endsAt > startsAt`;
- errores de validación inline;
- errores backend preservados;
- invalidación de query de Blocks después de crear;
- navegación de retorno al listado después de creación exitosa;
- responsive desktop/mobile.

Validación:

- probado funcionalmente contra backend real;
- creación real verificada;
- validación de Resource obligatorio verificada;
- validación de rango temporal verificada;
- exclusión de Resources archivados verificada;
- tests API y UI implementados.

---

## FE-BLK-003 — Cancel Block

Estado: Completed

Objetivo:

Cancelar un bloqueo preservando historial.

Implementado:

- cancelación contra `PATCH /businesses/:businessId/blocks/:blockId/cancel`;
- no se implementa eliminación física de Block;
- acción disponible directamente desde Block List;
- acción visible únicamente para `SCHEDULED` y `ACTIVE`;
- `FINISHED` y `CANCELLED` no muestran acción de cancelación;
- diálogo de confirmación con contexto del Resource y período;
- motivo de cancelación obligatorio entre 2 y 500 caracteres;
- validación inline antes de llamar al backend;
- error backend mostrado dentro del diálogo;
- invalidación automática de query de Blocks después de cancelar;
- historial preservado mediante estado `CANCELLED`;
- acción accesible en desktop y mobile;
- modal adaptado como bottom sheet en mobile.

Validación:

- cancelación real probada contra backend;
- cancelación de Block programado verificada;
- comportamiento para Block activo verificado;
- ausencia de acción para finalizados y cancelados verificada;
- validación de motivo verificada;
- tests API y UI implementados;
- regresión completa de frontend aprobada con 148 tests;
- build de producción aprobado;
- lint aprobado con 0 warnings y 0 errors;
- `git diff --check` aprobado.

---

# 13. FE-PAY — Payments

## FE-PAY-000 — Payment UI Discovery

Estado: Blocked

Bloqueado por:

- Backend Payment pendiente.

Objetivo:

No diseñar contratos definitivos frontend hasta que backend implemente PAY-001..PAY-004.

Cuando backend quede definido, reemplazar esta historia por historias reales de:

- registro de pago;
- detalle;
- historial;
- saldo;
- comprobantes;
- estados.

---

# 14. FE-DSH — Dashboard

## FE-DSH-001 — Business Dashboard

Estado: Completed

Definition of Done y evidencia:

- PR #68; feature HEAD `17739d13b98d3b4b2adef8ec7f97f9c2289ff161`; merge `a220af5c2d02964f5e9ec9347f633ea7da21a3c9`.
- Backend CI `34708288026` — SUCCESS; 191 tests frontend PASS, lint PASS y build PASS.
- Self-review frontend documentada por `rolandobarros27`; 0 threads conocidos.
- Verificación visual en Desktop 1440/1280/1024 y Mobile 390; Docker frontend validado.
- Datos reales y mocks separados explícitamente; sin cambios backend ni nuevas dependencias productivas.

Contrato backend disponible:

- `GET /api/businesses/:businessId/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- `dashboard.read`; autorización y aislamiento por Business a cargo del backend.
- Respuesta: `occupancy`, `revenue`, `reservations`; backend MVP conserva 53/53 — 100%.

Objetivo:

- Reemplazar el placeholder de `/app` por tres tarjetas con datos reales, tablas reales de Recursos/Precios y ocupación radial con distribución de los siete estados de reservas. Los previews sin contrato backend fueron retirados del MVP.
- Fechas obligatorias, `[from,to)`, máximo 31 días; editar no dispara requests hasta Aplicar. Ventana inicial de siete días basada en fechas locales del navegador, interpretadas por backend en la timezone del Business.
- Estados de carga, error con reintento, vacío, ocupación nula y validación; diseño responsive con tokens y App Shell existentes.
- `apiRequest`, sesión vigente y query cache por Business/período; Business temporal vía `VITE_DEV_BUSINESS_ID`, sin implementar FE-BUS-001.
- Referencia visual única: imagen adjunta. Figma queda descartado por decisión explícita del usuario.
- Fuentes REAL: Recursos activos y tabla mediante `GET /businesses/:businessId/resources`; portadas mediante `GET /businesses/:businessId/resources/images/covers`; Tarifas activas y tabla mediante `GET /businesses/:businessId/rate-plans`; Ingresos, Ocupación y Reservas mediante Dashboard. No se agregan requests por fila ni se infiere la tarifa o el tipo de Resource.
- Los widgets sin contrato backend aprobado fueron retirados del MVP; el Dashboard muestra únicamente datos reales.
- Cada fuente real tiene loading, vacío y error/reintento independiente. No se incorporan comparaciones históricas, nuevos endpoints ni nuevos permisos. La card informativa de hospitalidad es contenido estático, sin upselling.

No modifica backend ni completa automáticamente historias frontend relacionadas. Mutation diferida al quality gate preproducción.

---

---

# 15. Roadmap de ejecución

## Fase 1 — Acceso a TOP

Objetivo:

Que Jeni pueda iniciar sesión y entrar a la aplicación.

Historias:

- FE-FND-002
- FE-FND-003
- FE-FND-004
- FE-IAM-001
- FE-IAM-002
- FE-IAM-003
- FE-IAM-004
- FE-IAM-005
- FE-IAM-006

Milestone:

**M1 — Jeni puede iniciar sesión y entrar a TOP.**

---

## Fase 2 — Contexto Tobera

Objetivo:

Que Jeni ingrese al Business correcto.

Historias:

- FE-BUS-001
- FE-BUS-002
- FE-BUS-003
- App Shell privado

Milestone:

**M2 — Jeni puede entrar al panel de Tobera.**

---

## Fase 3 — Configuración operativa

Historias:

- FE-RES-001..006
- FE-CON-001..004
- FE-PRI-001..005
- FE-AVL-001..003
- FE-BLK-001..003

Milestone:

**M3 — Tobera puede configurar su operación diaria.**

---

## Fase 4 — Reservas

Historias:

- FE-BKG-001
- FE-BKG-002
- FE-BKG-003
- FE-BKG-004
- FE-BKG-005
- FE-BKG-006
- FE-BKG-007
- FE-BKG-008

Milestone:

**M4 — Tobera puede gestionar una reserva completa desde frontend.**

---

## Fase 5 — Gestión financiera y analítica

Historias:

- FE-PAY-* cuando backend esté disponible
- FE-DSH-* cuando backend esté disponible

---

# 16. Definition of Done frontend

Una historia frontend puede considerarse `Completed` cuando:

- consume contratos backend reales;
- no duplica reglas de negocio;
- contempla loading;
- contempla error;
- contempla empty cuando aplique;
- contempla success;
- es responsive;
- cumple accesibilidad básica;
- no contiene secretos;
- TypeScript compila;
- `npm run build` pasa;
- `npm run lint` pasa;
- tests relevantes pasan;
- el cambio está en una rama feature;
- el PR apunta a `develop`;
- si cambia un contrato consumido, se actualiza `docs/00-Current-Status.md`.

---

# 17. Dependencia con Backend

Responsable backend: Rolo.

Responsable frontend: Emanuel.

Regla:

Frontend no debe modificar backend para resolver inconsistencias de contrato.

Si frontend necesita un cambio backend:

1. registrar hallazgo;
2. documentar endpoint afectado;
3. describir comportamiento esperado;
4. enviar al responsable backend;
5. esperar contrato actualizado;
6. adaptar frontend después de merge a `develop`.

---

# 18. Estado vigente resumido

| Épica | Completed | In Progress | Planned | Blocked |
|---|---:|---:|---:|---:|
| Foundation | 6 | 1 | 3 | 0 |
| IAM | 6 | 0 | 0 | 0 |
| Business | 1 | 0 | 2 | 0 |
| Resource | 7 | 0 | 0 | 0 |
| Subscription | 0 | 0 | 1 | 0 |
| Contact | 4 | 0 | 0 | 0 |
| Availability | 2 | 0 | 0 | 0 |
| Pricing | 5 | 0 | 0 | 0 |
| Booking | 8 | 0 | 0 | 0 |
| Block | 3 | 0 | 0 | 0 |
| Payment | 0 | 0 | 0 | 1 |
| Dashboard | 1 | 0 | 0 | 0 |
| **TOTAL** | **43** | **1** | **6** | **1** |



