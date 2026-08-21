# TOP — Information Architecture v1

> **Estado: Draft avanzado.** Arquitectura conceptual sujeta a validación conforme maduren los dominios. No define permisos finales, rutas de frontend ni navegación definitiva. Las decisiones visuales vigentes prevalecen desde [Brand Book v1](../10-Brand-Book-v1.md).

## 1. Propósito

Este documento define cómo se organiza la información y la navegación principal de TOP.

Su objetivo es que una persona pueda entender rápidamente:

- dónde está;
- qué puede hacer;
- cómo llegar a una tarea;
- qué pertenece a operación diaria;
- qué pertenece a gestión;
- qué pertenece a configuración.

No define permisos finales, contratos API ni reglas de negocio.

La arquitectura debe mantenerse simple y escalable, evitando que TOP se convierta en un ERP con decenas de módulos visibles simultáneamente.

## 2. Principio general

La navegación de TOP se organiza según frecuencia y propósito de uso.

Tres niveles:

1. Operación diaria
2. Gestión
3. Configuración

La estructura debe favorecer tareas reales del alojamiento, no reflejar directamente la estructura técnica del backend.

## 3. Navegación principal propuesta

### Operación

- Inicio
- Calendario
- Reservas
- Disponibilidad

### Gestión

- Recursos
- Contactos
- Precios
- Pagos
- Bloqueos

### Configuración

- Negocio
- Usuarios y acceso
- Roles y permisos

## 4. Sidebar desktop

Propuesta:

```text
TOP

[Los Lapachos ▾]

Inicio

OPERACIÓN
Calendario
Reservas
Disponibilidad

GESTIÓN
Recursos
Contactos
Precios
Pagos
Bloqueos

────────────────

Configuración

[Usuario]
Emanuel Torres
Propietario
```

Reglas:

- TOP ocupa la parte superior.
- El Negocio activo siempre debe ser visible.
- La navegación no compite visualmente con el contenido.
- Las agrupaciones OPERACIÓN y GESTIÓN usan etiquetas discretas.
- Configuración se separa porque tiene menor frecuencia de uso.
- Perfil, sesión y opciones personales viven al final del sidebar.
- No mostrar módulos para los cuales el usuario no tenga acceso cuando exista RBAC definitivo.

## 5. Inicio

Propósito: responder en pocos segundos:

> ¿Qué está pasando hoy en mi alojamiento?

No debe convertirse en un dashboard financiero complejo.

Contenido potencial futuro:

- llegadas de hoy;
- salidas de hoy;
- ocupación próxima;
- reservas recientes;
- pagos pendientes relevantes;
- bloqueos activos;
- acciones rápidas.

Cada indicador debe permitir llegar a la tarea correspondiente. No usar métricas decorativas.

## 6. Calendario

Calendario representa la operación temporal completa.

Debe permitir comprender:

- qué Resource está ocupado;
- por qué reserva;
- cuándo inicia;
- cuándo termina;
- bloqueos;
- disponibilidad visual.

No debe depender exclusivamente de colores.

La interacción exacta se definirá cuando Booking, Availability y Block estén cerrados.

## 7. Reservas

Reservas debe ser una de las áreas centrales del producto.

Estructura:

```text
Reservas
├── Lista
├── Detalle
├── Crear reserva
└── Editar reserva
```

La lista debe favorecer búsqueda y operación.

En móvil, no forzar tablas horizontales: convertir filas en bloques/listas legibles.

## 8. Disponibilidad

Disponibilidad responde una pregunta específica:

> ¿Qué puedo reservar entre estas fechas?

No debe mezclarse con Calendario.

Flujo conceptual:

```text
Entrada
Salida
Huéspedes
[Buscar disponibilidad]

↓
Recursos disponibles
```

Disponibilidad es una herramienta de búsqueda operativa. Calendario es una vista temporal de la operación.

## 9. Recursos

Estructura:

```text
Recursos
├── Lista
├── Crear
├── Detalle
└── Editar
```

Dentro del detalle pueden aparecer Resumen, Fotos, Amenidades y Precios, sin introducir tabs prematuros cuando no exista contenido suficiente.

## 10. Contactos

Estructura:

```text
Contactos
├── Lista
├── Crear
├── Detalle
└── Editar
```

La información derivada, como reservas históricas o próximas, solo se mostrará cuando exista soporte real de backend.

## 11. Precios

Pricing debe hablar en lenguaje comercial.

Estructura:

```text
Precios
├── Planes tarifarios
├── Temporadas
└── Calculadora
```

La Calculadora puede funcionar como herramienta secundaria. Una vez exista Booking, el cálculo será consumido principalmente desde el flujo de creación de reserva.

## 12. Pagos

Pagos no debe convertirse en contabilidad.

Propósito: gestionar pagos asociados a reservas.

Estructura propuesta:

```text
Pagos
├── Lista
├── Registrar pago
└── Detalle / historial
```

Los estados financieros deben ser explícitos y no depender del color.

## 13. Bloqueos

Bloqueos representa períodos donde un Resource no puede reservarse por razones operativas.

Ejemplos:

- mantenimiento;
- uso privado;
- limpieza especial;
- cierre temporal.

Estructura:

```text
Bloqueos
├── Lista
├── Crear bloqueo
└── Detalle
```

No representar bloqueos como reservas falsas.

## 14. Configuración

Configuración no debe funcionar como un cajón de sastre.

```text
Configuración

Negocio
Datos generales, ubicación, moneda y preferencias.

Usuarios y acceso
Personas que pueden trabajar en este negocio.

Roles y permisos
Qué puede hacer cada tipo de usuario.
```

Las futuras configuraciones solo se agregan cuando existe una capacidad real.

## 15. Selector de Negocio

TOP es multi-business. El Negocio activo debe ser parte estructural del App Shell.

Reglas:

- no cambiar silenciosamente de Negocio;
- el cambio debe ser explícito;
- después del cambio debe quedar visualmente claro el nuevo contexto;
- nunca mezclar datos de dos Businesses en una misma vista operativa.

## 16. Navegación móvil

En móvil no debe reducirse el sidebar desktop a un hamburger gigantesco.

Bottom navigation propuesta:

- Inicio
- Calendario
- Reservas
- Más

Dentro de Más:

```text
Disponibilidad

GESTIÓN
Recursos
Contactos
Precios
Pagos
Bloqueos

CONFIGURACIÓN
Negocio
Usuarios y acceso

CUENTA
Perfil
Cerrar sesión
```

La creación de reserva puede utilizar una acción contextual prominente cuando corresponda.

## 17. Navegación contextual

No todas las acciones pertenecen al sidebar.

Ejemplo:

```text
Recursos
→ Cabaña Lapacho
→ Editar
```

Debe resolverse mediante título de página, breadcrumb cuando aporte contexto y acción contextual. No añadir cada subpantalla al sidebar.

## 18. Breadcrumbs

Usar breadcrumbs solamente cuando exista profundidad real.

Sí:

```text
Recursos / Cabaña Lapacho / Editar
Precios / Plan estándar / Temporadas
```

En móvil puede reducirse a:

```text
← Recursos

Cabaña Lapacho
```

## 19. Búsqueda

TOP debería evolucionar hacia una búsqueda global, pero no es necesaria para Design System v1.

Primero:

- búsqueda local en Reservas;
- búsqueda local en Contactos;
- búsqueda local en Recursos.

Futuro:

```text
⌘ K / Ctrl K
Buscar en TOP...
```

Una command palette puede ser excelente para usuarios avanzados, pero nunca debe ser necesaria para descubrir funcionalidades básicas.

## 20. Jerarquía de rutas conceptual

Las URLs finales dependen de frontend y seguridad, pero la arquitectura conceptual debería mantenerse cercana a:

```text
/dashboard
/calendar
/bookings
/bookings/new
/bookings/:id
/availability
/resources
/resources/new
/resources/:id
/contacts
/contacts/:id
/pricing
/pricing/rate-plans
/pricing/rate-plans/:id
/payments
/blocks
/settings
/settings/business
/settings/users
/settings/roles
```

No exponer `businessId` visualmente como parte necesaria de navegación si el contexto activo ya está establecido de forma segura.

## 21. Estados de navegación

El usuario debe saber siempre:

- módulo actual;
- pantalla actual;
- Negocio activo.

No usar múltiples indicadores visuales compitiendo entre sí.

## 22. Progressive disclosure

TOP debe evitar mostrar toda la complejidad desde el inicio.

Por ejemplo, un futuro flujo de crear reserva puede avanzar de fechas/recurso/huésped hacia precio y luego confirmación, en lugar de mostrar decenas de campos simultáneamente.

La división exacta se definirá cuando Booking esté diseñado.

## 23. Módulos no visibles en navegación principal

Algunas capacidades pueden existir técnicamente sin necesitar un ítem permanente.

Ejemplos:

- Amenities;
- Seasonal Rates;
- Manual Price Override;
- Membership;
- Pricing Calculator.

Estas capacidades deben aparecer dentro del módulo al que pertenecen.

Agregar una capacidad al backend no implica agregar un ítem al sidebar.

## 24. Arquitectura resumida

```text
TOP

Inicio

OPERACIÓN
├── Calendario
├── Reservas
└── Disponibilidad

GESTIÓN
├── Recursos
│   ├── Detalle
│   ├── Fotos
│   └── Amenidades
├── Contactos
├── Precios
│   ├── Planes tarifarios
│   ├── Temporadas
│   └── Calculadora
├── Pagos
└── Bloqueos

CONFIGURACIÓN
├── Negocio
└── Usuarios y acceso
    ├── Usuarios
    ├── Membresías
    └── Roles y permisos

CUENTA
├── Perfil
└── Cerrar sesión
```

## 25. Principio de crecimiento

Antes de crear un nuevo módulo visible debe preguntarse:

1. ¿Es una tarea independiente?
2. ¿Se usa con frecuencia suficiente?
3. ¿Tiene información propia relevante?
4. ¿No encaja naturalmente dentro de otro módulo?
5. ¿El usuario la buscaría con este nombre?

Si varias respuestas son “no”, la capacidad debe vivir dentro de un módulo existente.

## 26. Decisiones pendientes

No congelar todavía:

- flujo final de Booking;
- vista final de Availability;
- estructura exacta de Payments;
- estados y acciones finales del Calendario;
- visibilidad por Roles;
- comportamiento exacto del selector multi-Business;
- command palette;
- notificaciones;
- búsqueda global;
- Dashboard definitivo.

Estas decisiones se cerrarán conforme maduren los dominios correspondientes.
