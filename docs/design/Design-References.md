# TOP — Design References v1

> **Estado: Review / near Approved.** Referencias de aprendizaje, no plantillas ni especificaciones de frontend. Las decisiones visuales vigentes prevalecen desde [Brand Book v1](../10-Brand-Book-v1.md).

## 1. Propósito

Este documento define productos de referencia para TOP y, sobre todo, qué aprendizajes tomar de cada uno.

Las referencias no son plantillas para copiar. TOP debe conservar su propia identidad, lenguaje de hospitalidad, reglas de dominio y foco en pequeños establecimientos turísticos.

## 2. Norte general

La dirección buscada puede resumirse como:

**La simplicidad de Notion + la estructura operativa de Shopify + la precisión de Stripe + la densidad controlada de Linear.**

El objetivo es combinar **consumer-grade usability** con **B2B-grade control**.

TOP debe sentirse actual, sencillo e intuitivo, pero suficientemente riguroso para uso operativo diario.

## 3. Linear

### Tomar

- jerarquía visual fuerte;
- sidebar sobrio;
- navegación que retrocede visualmente frente al contenido;
- alta densidad sin ruido;
- consistencia de componentes;
- uso restringido del color;
- listas y tablas compactas;
- microinteracciones discretas;
- sensación de producto contemporáneo.

### No tomar

- estética excesivamente developer/tech;
- dark mode como identidad dominante;
- dependencia de shortcuts para descubrir funciones básicas;
- densidad extrema en móvil.

### Uso para TOP

Referencia principal para **sensación visual, jerarquía y disciplina operativa**.

## 4. Shopify Admin

### Tomar

- arquitectura de información para un back office de negocio;
- organización por tareas reales;
- sidebar estable;
- selector de negocio/tienda;
- convivencia de operación, gestión y configuración;
- patrones claros para listas, detalles y formularios;
- responsive orientado a dueños y operadores.

### Analogía conceptual

```text
Shopify                TOP

Orders               → Reservas
Products             → Recursos
Customers            → Contactos
Analytics            → Inicio / Dashboard
Discounts            → Precios
Staff/permissions    → Usuarios y acceso
Store selector       → Selector de Negocio
Settings             → Configuración
```

### No tomar

- complejidad acumulada de un producto con décadas de módulos;
- navegación demasiado extensa;
- funcionalidades e-commerce que no correspondan al dominio de TOP.

### Uso para TOP

Referencia principal para **arquitectura de información y back office**.

## 5. Stripe Dashboard

### Tomar

- precisión en información monetaria;
- estados explícitos;
- tablas financieras;
- filtros;
- detalle de entidades;
- acciones sensibles;
- jerarquía de importes;
- tratamiento sobrio de errores;
- consistencia entre overview y detalle.

### Aplicación en TOP

Especialmente útil para:

- Pricing;
- Payments;
- Booking totals;
- saldos;
- historial de pagos;
- auditoría y acciones sensibles.

### No tomar

- lenguaje excesivamente financiero o técnico;
- densidad pensada para equipos especializados;
- patrones que dependan del modelo conceptual específico de pagos de Stripe.

### Uso para TOP

Referencia principal para **dinero, estados y operaciones sensibles**.

## 6. Notion

### Tomar

- calma visual;
- composición limpia;
- jerarquía tipográfica;
- superficies neutras;
- progressive disclosure;
- ausencia de decoración innecesaria;
- sensación de producto actual y bien cuidado;
- interacción fluida.

### No tomar

- edición libre como paradigma principal;
- ocultamiento excesivo de acciones;
- dependencia de menús contextuales;
- interfaces que requieran aprendizaje de comandos para descubrir capacidades.

### Uso para TOP

Referencia principal para **simplicidad, composición y feeling contemporáneo**.

## 7. Odoo y ERPs tradicionales

### Tomar

- comprensión de problemas operativos complejos;
- convivencia de módulos;
- patrones de administración;
- necesidades reales de back office.

### No tomar

- apariencia de ERP tradicional;
- navegación saturada;
- exceso de tablas y formularios visibles simultáneamente;
- dashboards llenos de widgets;
- terminología interna expuesta al usuario;
- módulos separados solo porque existen técnicamente.

### Uso para TOP

Referencia funcional, **no dirección visual**.

## 8. Principio de síntesis

TOP no busca ser “un ERP bonito”.

Debe sentirse como un producto diseñado desde cero para operación moderna de alojamientos.

Como metáfora de diseño:

> **Si Linear y Shopify diseñaran una herramienta operacional para pequeños alojamientos, con el cuidado de datos de Stripe y la calma de Notion.**

## 9. Modernidad silenciosa

El feeling contemporáneo no debe depender de tendencias visuales pasajeras.

Preferir:

- tipografía refinada;
- whitespace controlado;
- navegación clara;
- microinteracciones;
- estados bien diseñados;
- buena alineación de números;
- skeletons que reflejan contenido real;
- hover y focus sutiles;
- iconografía consistente;
- drawers y modales con transiciones rápidas.

Evitar:

- glassmorphism;
- gradientes sin función;
- sombras pesadas;
- exceso de cards;
- animaciones ornamentales;
- colores múltiples compitiendo;
- interfaces de marketing dentro del producto operativo.

## 10. Criterio final

Una pantalla de TOP debería provocar tres respuestas:

1. **“Entiendo esto inmediatamente.”**
2. **“Se siente muy bien hecho.”**
3. **“Podría usarlo todos los días.”**

La tercera es crítica: TOP es software operativo y debe soportar uso intensivo sin fatigar.
