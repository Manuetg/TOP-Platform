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
- La política de contraseña, la selección del contexto activo y la matriz detallada de permisos continúan pendientes.

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
