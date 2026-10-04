# Backend TOP

Usar Node 22 y `npm ci`, copiar `.env.example` como `.env` y ejecutar `npm run dev`.
El Compose es exclusivamente local: declara `NODE_ENV=development`, correo console
y MinIO con el bucket `top-resource-images`. Sus volúmenes y comando de migración
local se conservan; no ejecutar ese comando contra datos productivos.

## Arranque y configuración

`NODE_ENV` acepta únicamente `development`, `test` y `production`. Si no se
suministra en el entorno de ejecución, se considera `development`. Solo en
desarrollo se carga automáticamente `.env`; su `NODE_ENV` no cambia el entorno
seleccionado por la shell. ConfigModule ignora archivos `.env` en test y producción.
La imagen ejecuta en producción por defecto, después de instalar y compilar con
las herramientas necesarias. Suministrar variables al proceso/contenedor en
runtime; nunca incluir secretos en Dockerfile, argumentos de build o capas.

La configuración se valida antes de escuchar HTTP. Un error termina el arranque
con código distinto de cero y menciona la variable/requisito, sin mostrar su valor.
Los consumidores usan los valores validados, incluidos Prisma, JWT, enlaces de
verificación, TTL/cooldown, SMTP y storage. No se realizan comprobaciones remotas
obligatorias de SMTP ni S3 durante el arranque.

Prisma 6 puede conservar rutas de autoload env en un cliente generado localmente.
El bootstrap HTTP por defecto (`main.ts`) captura y valida el entorno antes de importar Prisma y, en producción,
rechaza artefactos con esas rutas antes de leer `.env`. Construir el artefacto
productivo mediante el Dockerfile, que genera Prisma sin archivos env en su contexto;
no reutilizar el cliente generado con `.env` del checkout de desarrollo. No se
parchea el cliente generado ni se cambia el SDK/schema. Los metadatos desconocidos
se rechazan y requieren revisar esta comprobación al actualizar Prisma. Esta
protección del artefacto corresponde a ese bootstrap HTTP; una CLI o un import
directo de AppModule no ejecuta ese guard.

| Variable / capacidad | Desarrollo y test | Producción |
|---|---|---|
| `DATABASE_URL` | Obligatoria, PostgreSQL con host/base | Igual; conserva parámetros Prisma de SSL, pooling y sockets |
| `PORT` | Default 3000; override entero 1..65535 | Igual |
| `JWT_ACCESS_SECRET` | Obligatorio; admite secreto local de pruebas | Explícito, mínimo 32 bytes UTF-8, sin valores conocidos de desarrollo/ejemplo |
| `PASSWORD_RESET_OTP_SECRET` | Default local exclusivo de desarrollo/test | Explícito, mínimo 32 bytes, distinto de JWT, sin fallback |
| `APP_PUBLIC_URL` | Default `http://localhost:3001` | URL HTTPS explícita, sin credenciales, query ni fragmento |
| `CORS_ORIGIN` | Lista explícita de orígenes HTTP/HTTPS; ausente no concede CORS | Lista obligatoria de orígenes HTTPS exactos |
| `EMAIL_DELIVERY_MODE` | `console` por defecto o `smtp` validado | `smtp` explícito obligatorio |
| `SMTP_HOST`, `SMTP_FROM` | Obligatorios solo en modo smtp | Host/IP y único remitente válidos obligatorios |
| `SMTP_PORT` | Default 587; entero 1..65535 | Igual; 465 usa TLS directo, otros puertos exigen STARTTLS |
| `SMTP_USER`, `SMTP_PASSWORD` | Pareja opcional: ambos ausentes o ambos válidos | Igual; sin ejemplos; certificados siempre validados |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Configuración completa si se selecciona bucket; si no, memoria local | Obligatorios; endpoints efectivos HTTPS, nunca fallback a memoria |
| `S3_PUBLIC_ENDPOINT` | Opcional, fallback a `S3_ENDPOINT`; HTTP local permitido | Opcional con mismo fallback; HTTPS y sin credenciales/query/fragmento |
| `S3_FORCE_PATH_STYLE` | Default false; solo `true`/`false` | Igual |
| Swagger UI / JSON / YAML | Disponibles en `/api/docs`, `/api/docs-json`, `/api/docs-yaml` | No se generan ni registran; sin opción de reactivación |

Los TTL se expresan en segundos como enteros positivos: `REFRESH_TOKEN_TTL_SECONDS`
(2592000), `PASSWORD_RESET_TTL_SECONDS` (1800), `PASSWORD_RESET_OTP_TTL_SECONDS`
(600) y `EMAIL_VERIFICATION_TTL_SECONDS` (86400). Los cooldowns admiten enteros
no negativos: `PASSWORD_RESET_OTP_RESEND_SECONDS` y
`EMAIL_VERIFICATION_RESEND_SECONDS` (ambos 60). Un override vacío, decimal,
negativo o no numérico se rechaza; no cambia silenciosamente al default.
Para los cuatro TTL también se rechazan duraciones que no permiten convertir a
milisegundos enteros seguros y sumar el instante de validación dentro del rango
de `Date` y del DateTime aceptado por Prisma vigente (año de cuatro dígitos,
hasta `9999-12-31T23:59:59.999Z`). El máximo técnico en segundos es
`min(floor(Number.MAX_SAFE_INTEGER / 1000), floor((8640000000000000 - now) / 1000), floor((253402300799999 - now) / 1000))`,
con un único instante capturado por validación; conserva los defaults y no añade
un límite comercial. El rango procede de
[ECMAScript TimeClip](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-timeclip).
El formato de año de cuatro dígitos está definido en
[RFC 3339, §5.6](https://www.rfc-editor.org/rfc/rfc3339#section-5.6); la frontera
9999/10000 se verificó mediante Prisma 6 sobre PostgreSQL desechable, sin escrituras.
La comprobación acredita una expiración representable en ese instante, sin
garantizar relojes futuros arbitrarios ni cambiar los consumidores de expiración.
La duración del access token sigue siendo 900 segundos y el algoritmo HS256.

El mínimo JWT corresponde a [RFC 7518, §3.2](https://www.rfc-editor.org/rfc/rfc7518#section-3.2).
Se aplica también a OTP en este corte. La longitud no garantiza aleatoriedad:
generar ambos secretos independientemente con una fuente criptográfica segura
fuera de la aplicación y suministrarlos desde el entorno protegido de ejecución.
No se generan al arrancar ni se recortan/transforman silenciosamente.

CORS compara esquema, host y puerto completos. Rechaza wildcard, `null`, entradas
vacías y URLs con credenciales, path operativo, query o fragmento. Un origen ajeno
no recibe headers de permiso y no causa 500. Preflight permite los métodos
actuales y `Content-Type`, `Authorization`, `Idempotency-Key`. Las solicitudes
sin Origin siguen pasando por autenticación/autorización: CORS no concede acceso
al backend. La URL pública no se deriva de headers de solicitudes.

`.env` dejó de estar versionado y se conserva localmente; el ejemplo contiene
únicamente datos locales/sintéticos. Git y Docker excluyen variantes env y archivos
de credenciales. Si se detecta posteriormente un secreto real expuesto, debe
rotarse fuera de este cambio; retirar el archivo no borra el historial Git.

### Outbound connection-aware

Las conversaciones nuevas de Messaging conservan `MessagingConnection.id` y las
respuestas bot/manuales copian esa conexión al crear `OutboundMessage`. El sender
Meta se obtiene de `providerPhoneNumberId` de esa conexión; `META_WHATSAPP_PHONE_NUMBER_ID`
queda únicamente para el smoke manual compatible con una conexión. Las automations
de Booking solo crean mensajes cuando existe exactamente una conexión WhatsApp
`ACTIVE`; cero conexiones es configuración ausente y más de una es routing ambiguo.
Los datos legacy sin conexión no se completan por inferencia: las respuestas manuales
fallan de forma controlada y los mensajes salientes no pueden enviarse por el pipeline
connection-aware. El token global `META_WHATSAPP_ACCESS_TOKEN` es transitorio para
desarrollo/smoke; el almacenamiento de credenciales por conexión queda pendiente de
Embedded Signup o un vault y no se considera todavía outbound multi-tenant listo para
producción.

## Verificación

Ejecutar build, lint, unitarias, integración PostgreSQL, E2E, aceptación,
cobertura, arquitectura y `npx prisma validate`. Integración, E2E PostgreSQL y
escenarios `@postgres` requieren una base desechable cuyo nombre incluya `test`,
con las migraciones vigentes aplicadas. No usar bases locales existentes.
`npm run test:acceptance` crea un proceso con `NODE_ENV=test` antes de importar
AppModule; no cambia las variables de la shell ni convierte otras suites a producción.

`node test/packaging/production-image.smoke.mjs` verifica build Docker, entorno
productivo por defecto, exclusión de fixtures sintéticas del filesystem/capas,
Compose local y arranque HTTP/CORS/guards con PostgreSQL efímero. Requiere Docker,
no publica puertos ni utiliza volúmenes persistentes, no envía correos reales y
conserva la imagen para gates posteriores. El script limpia sus contenedores/red.
