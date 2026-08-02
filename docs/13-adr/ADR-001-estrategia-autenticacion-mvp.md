# ADR-001 — Estrategia de autenticación para el MVP

**Estado:** Aprobada
**Fecha:** 2026-08-02

## Contexto

TOP requiere autenticar usuarios y autorizar sus operaciones dentro de uno o varios Negocios, sin comprometer el aislamiento multi-tenant. La arquitectura aprobada usa NestJS, PostgreSQL y Prisma, y mantenía pendiente el proveedor de autenticación.

## Decisión

TOP utilizará autenticación propia en NestJS durante el MVP.

### Credenciales

- El identificador de acceso es un email normalizado.
- La contraseña se almacena únicamente como hash.
- Se adopta Argon2id como algoritmo de hash.
- No habrá registro público en el MVP.

El email se normaliza mediante `trim` y conversión completa a minúsculas, después se valida su formato y unicidad global. TOP no elimina puntos ni alias `+` específicos de proveedores. Un email normalizado duplicado se rechaza.

La política inicial de contraseña admite entre 12 y 128 caracteres, incluidos espacios y caracteres Unicode. No exige combinaciones arbitrarias de mayúsculas, números o símbolos, no trunca la contraseña y no registra la contraseña ni su hash. La comprobación de contraseñas comprometidas queda para una mejora futura.

### Aprovisionamiento inicial de User

La primera implementación de IAM-004 usa aprovisionamiento administrativo mediante script o seed controlado. Esta estrategia evita una dependencia circular: Login aún no existe y, por tanto, no puede proteger el primer User administrativo.

Crear User crea también LocalCredential, de manera atómica, con estado inicial `ACTIVE`. No crea una membresía, no asigna un Business implícito, no inicia sesión y no emite tokens.

`POST /api/users` queda aprobado como contrato para habilitación posterior, cuando exista un mecanismo administrativo de autorización en backend.

```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña segura"
}
```

Respuesta `201`:

```json
{
  "id": "uuid",
  "email": "usuario@ejemplo.com",
  "status": "ACTIVE",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Devuelve `400` para request inválido y `409` para email ya registrado. Nunca devuelve contraseña, passwordHash, tokens ni membresías inexistentes.

### Membresías User–Business

IAM-009 — Manage User-Business Membership es una capacidad independiente. Crea la relación entre User, Business y uno de los roles `OWNER`, `ADMIN`, `RECEPTIONIST` o `VIEWER`.

El contrato propuesto es `POST /api/businesses/:businessId/memberships`.

```json
{
  "userId": "uuid",
  "role": "OWNER"
}
```

Respuesta `201`:

```json
{
  "id": "uuid",
  "userId": "uuid",
  "businessId": "uuid",
  "role": "OWNER",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Devuelve `400` para UUID o rol inválido, `404` para User o Business inexistente, `409` para membresía duplicada y `403` cuando exista un contexto autenticado sin autorización suficiente.

IAM-009 no crea User ni LocalCredential, no inicia Login y no administra permisos adicionales. Cada combinación de User y Business es única.

### Criterios de prueba para IAM-004

- **Unitarias:** normalizan email, rechazan email duplicado y contraseñas inválidas, crean User `ACTIVE`, generan el hash y no exponen datos sensibles.
- **Integración PostgreSQL:** verifican unicidad del email normalizado, relación uno a uno entre User y LocalCredential, persistencia exclusiva de `passwordHash` y rollback atómico si falla la credencial.
- **E2E:** verifican el contrato de `POST /api/users` cuando el endpoint se habilite con autorización administrativa; incluyen `400`, `409` y ausencia de password, passwordHash y tokens en la respuesta.
- **Aceptación Gherkin:** describen el aprovisionamiento administrativo exitoso, email duplicado y contraseña inválida.
- **Mutation testing:** cubre validaciones de email, contraseña, duplicados, estado inicial y atomicidad.
- **Arquitectura y seguridad:** el dominio no depende de NestJS ni Prisma; los secretos y datos sensibles no se registran; la creación de identidad no permite acceso cruzado entre Businesses.

### Tokens

IAM-001 emitirá únicamente un access token JWT con tipo `Bearer` y una expiración inicial de 15 minutos (`900` segundos).

Refresh token, logout y revocación no forman parte de IAM-001 y se implementarán como capacidades separadas del backlog.

### Contexto multi-negocio

- User es una identidad global.
- User puede pertenecer a varios Businesses mediante membresías.
- Cada membresía determina el rol aplicable en ese Business.
- Login no selecciona silenciosamente un Business activo.
- La respuesta de login devuelve las membresías disponibles.
- La selección explícita del contexto activo se definirá en una capacidad separada o en la autorización posterior.

### Roles iniciales

- `OWNER`.
- `ADMIN`.
- `RECEPTIONIST`.
- `VIEWER`.

### Contrato de IAM-001

```http
POST /api/auth/login
```

Request:

```json
{
  "email": "propietario@ejemplo.com",
  "password": "..."
}
```

Respuesta `200`:

```json
{
  "accessToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "propietario@ejemplo.com"
  },
  "businesses": [
    {
      "businessId": "uuid",
      "role": "OWNER"
    }
  ]
}
```

- `400`: estructura inválida.
- `401`: email inexistente, contraseña inválida o User deshabilitado.
- Los fallos de credenciales usan un único mensaje genérico.

La respuesta no incluye contraseña, hash de contraseña, refresh token, permisos completos ni selección automática de Business.

### Seguridad

- Proteger contra enumeración de usuarios mediante un mensaje genérico y un hash ficticio cuando el User no exista.
- Aplicar rate limiting a los intentos de login.
- Administrar secretos mediante variables de entorno.
- No registrar contraseñas, hashes ni tokens.
- Validar toda autorización en backend.

## Consecuencias

### Ventajas

- Conserva el modelo de User, membresías y roles dentro del dominio de TOP.
- Permite desarrollo y pruebas locales sin depender de un servicio externo.
- Evita bloquear el MVP por una decisión de proveedor de despliegue aún pendiente.

### Riesgos y carga operativa

- TOP asume la correcta implementación y operación de hashes, secretos, rate limiting, tokens y recuperación futura de credenciales.
- Se deben completar las capacidades de User, membresías y roles antes de Login.
- La selección del contexto activo, el estado individual de membresías y la matriz detallada de permisos continúan pendientes.

### Migración futura

La decisión no impide una futura migración a un proveedor externo. Para facilitarla, la autenticación y emisión de tokens deben permanecer detrás de contratos de aplicación.

### Alternativas no elegidas para el MVP

- **Auth0:** añade dependencia de proveedor, sincronización de identidades y evaluación continua de costos y límites.
- **Clerk:** incorpora un modelo externo de organizaciones que requeriría mapearse cuidadosamente al concepto Business.
- **Cognito:** depende de adoptar AWS como proveedor de despliegue, decisión que sigue pendiente.
- **Supabase Auth:** añade una plataforma adicional junto con PostgreSQL y Prisma ya aprobados.

Estas alternativas pueden revisarse en el futuro; no quedan descartadas de forma permanente.

## Referencias

- [Arquitectura](../05-Architecture.md).
- [Domain Bible](../03-Domain-Bible.md).
- [Business Rules](../04-Business-Rules.md).
- [Backlog](../07-Backlog.md).
