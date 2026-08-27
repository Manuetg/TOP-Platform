# TOP Platform Frontend — Recovery

Reconstruido a partir del estado trabajado en el chat.

## Requisitos

- Node.js compatible con Vite 8
- Backend TOP en `http://localhost:3000`
- Frontend en `http://localhost:3001`

## Instalación

```bash
npm install
```

## Variables de entorno

Copiar `.env.example` a `.env.local` si hace falta:

```env
VITE_API_URL=http://localhost:3000/api
```

## Ejecutar

```bash
npm run dev
```

## Validación

```bash
npm run build
npm run lint
npm run test
```

## Estado funcional reconstruido

- React + TypeScript + Vite
- TanStack Query provider
- React Router
- Design tokens TOP
- Plus Jakarta Sans
- Button / Input / Badge
- Vitest + Testing Library
- Login page conectada a `POST /api/auth/login`
- Manejo básico de errores de login
- Frontend configurado para puerto 3001
