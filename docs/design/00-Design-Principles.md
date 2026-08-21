# TOP — Product Design Principles v1

> **Estado: Review.** Este documento guía la exploración y validación de Product Design. No es una especificación definitiva para frontend. Las decisiones visuales vigentes prevalecen desde [Brand Book v1](../10-Brand-Book-v1.md).

## 1. Propósito

Este documento define los principios rectores para diseñar la interfaz y experiencia de TOP.

Su función es guiar decisiones de arquitectura de información, navegación, composición de pantallas, flujos, formularios, calendarios, tablas, feedback, estados, responsive, accesibilidad y componentes del Design System.

No define reglas de negocio, permisos, contratos API ni lógica de dominio. Cuando exista conflicto entre una decisión visual y una regla de negocio, prevalece el dominio y el backend.

## 2. Objetivo de experiencia

TOP debe permitir que una persona que administra un alojamiento pueda entender rápidamente:

**Dónde estoy → qué está pasando → qué puedo hacer → qué ocurrió después de hacerlo.**

La experiencia objetivo es de **tranquilidad operativa**.

TOP no debe sentirse como un ERP pesado, una planilla sofisticada, un sistema técnico, una plataforma turística decorativa ni una interfaz cargada de dashboards. Debe sentirse como una herramienta de operación **moderna, clara y confiable**, con una capa humana propia de la hospitalidad.

La personalidad visual aprobada es moderna y confiable, con un matiz natural controlado.

## 3. Principios rectores

### P1 — El contexto siempre es visible

Una operación nunca debe depender de que el usuario recuerde mentalmente dónde está trabajando.

Especialmente deben permanecer claros:

- Negocio activo;
- sección actual;
- entidad que se está modificando;
- período o fecha cuando sea relevante;
- estado actual.

Si una acción puede afectar información de un Negocio, Resource, Booking o período incorrecto, el contexto debe estar visible antes de ejecutar la acción.

### P2 — La tarea principal gana

Cada pantalla debe responder: **¿Cuál es la tarea principal que el usuario vino a realizar aquí?**

La interfaz debe priorizar esa tarea sobre información secundaria.

Esto implica:

- una acción primaria clara por región de decisión;
- evitar múltiples botones visualmente equivalentes;
- esconder complejidad secundaria hasta que sea necesaria;
- evitar dashboards con métricas sin función operativa;
- reducir decisiones simultáneas.

### P3 — Claridad antes que densidad

TOP manejará reservas, fechas, precios, huéspedes, pagos, recursos y estados. Eso no significa que cada pantalla tenga que mostrarlo todo.

La densidad debe ser progresiva:

```text
móvil
↓
información esencial

tablet
↓
más contexto

desktop
↓
mayor densidad operacional
```

No deben existir capacidades exclusivas de escritorio únicamente porque allí hay más espacio. El usuario móvil debe poder completar el flujo principal completo.

### P4 — Mostrar estado, no obligar a inferirlo

Los estados deben ser explícitos mediante texto, iconografía y tratamiento visual. La información crítica nunca dependerá únicamente de color.

Esto aplica especialmente a disponibilidad, estados financieros, permisos, errores, reservas, estados de Resource y operaciones destructivas.

### P5 — Velocidad para lo frecuente, deliberación para lo sensible

Las acciones frecuentes y reversibles deben requerir pocos pasos. Las acciones sensibles deben mostrar qué va a ocurrir, sobre qué entidad, sus consecuencias relevantes y una confirmación explícita cuando corresponda.

**Confirmar todo ralentiza. Confirmar lo importante protege.**

### P6 — Hablar como habla el alojamiento

El modelo interno puede utilizar conceptos como `Resource`, `RatePlan`, `PricingSnapshot` o `Business`; la interfaz debe utilizar vocabulario de usuario.

Cuando el tipo de establecimiento lo permita, el término visible de Resource debe adaptarse: cabaña, habitación, domo, parcela u otro.

### P7 — El sistema explica; el backend decide

Frontend puede ayudar, prevenir errores obvios, mostrar límites, validar formato y anticipar consecuencias. Nunca debe convertirse en fuente de verdad para permisos, disponibilidad, precios, tenant isolation, estados o reglas financieras.

Toda operación crítica debe aceptar que el backend pueda rechazarla y presentar ese rechazo correctamente.

### P8 — Preservar el trabajo y el contexto

Cuando sea seguro, los errores deben conservar campos completados, filtros, período seleccionado, scroll y contexto. El sistema debe indicar exactamente qué debe corregirse sin obligar a empezar desde cero.

### P9 — Historial no es basura

TOP administra información operativa y financiera. Cuando una entidad tiene valor histórico, la interfaz no debe sugerir eliminación definitiva si el dominio no la permite.

Preferir conceptos como `Archivar`, `Cancelar`, `Anular` o `Fuera de servicio` frente a `Eliminar` o `Borrar` cuando estos últimos no representen la semántica real.

### P10 — Una interfaz serena no es una interfaz vacía

La dirección visual busca calma y sobriedad, pero TOP sigue siendo software operativo.

**Calma ≠ espacios gigantes.**

**Minimalismo ≠ ocultar información necesaria.**
**Elegancia ≠ baja densidad.**

Las interfaces pueden contener tablas, calendarios y bastante información manteniendo jerarquía clara, espaciado consistente, bordes discretos, color controlado y agrupación lógica.

### P11 — El color comunica intención, no decoración

La paleta definitiva es **Bosque y arcilla**.

```text
Primary → acción / navegación / foco
Success → resultado positivo
Warning → requiere atención
Error → problema o riesgo
Info → información contextual
Accent → énfasis no crítico
```

El verde principal no debe teñir toda la aplicación. La mayor parte de la interfaz debe permanecer neutral y reservar el color para intención, estado y foco.

### P12 — Diseñar primero el caso real, después los extremos

Cada pantalla comienza por el flujo cotidiano. Después se diseñan estados vacíos, loading, error, conflicto, permisos, archivo y otros casos extremos.

Antes de considerar una pantalla terminada, sus estados importantes deben estar definidos.

## 4. Modernidad silenciosa

TOP debe sentirse actual sin depender de efectos visuales llamativos.

Sí:

- tipografía refinada;
- espaciado consistente;
- bordes suaves;
- estados bien diseñados;
- iconografía limpia;
- microinteracciones discretas;
- superficies claras;
- drawers y modales bien resueltos;
- navegación fluida;
- command/search patterns cuando aporten valor.

No:

- glassmorphism por moda;
- gradientes innecesarios;
- sombras pesadas;
- cards dentro de cards sin necesidad;
- dashboards llenos de widgets;
- animaciones decorativas;
- botones sobredimensionados;
- exceso de colores.

TOP debe aspirar a **consumer-grade usability con B2B-grade control**: fácil y agradable de usar como una aplicación moderna de consumo, pero suficientemente rigurosa para manejar reservas, dinero y operación diaria.

## Visual North Star

La imagen conceptual aprobada del Dashboard de TOP define una dirección visual de referencia para futuras pantallas. No constituye una especificación pixel-perfect ni autoriza pantallas o capacidades aún no aprobadas.

Debe preservar sidebar limpio y persistente en desktop, superficies blancas sobre fondo cálido, verde bosque como primario, acentos arcilla contenidos, tipografía moderna, cards suaves de baja elevación, bordes discretos, tablas y listas limpias, densidad operacional moderada, iconografía lineal y microinteracciones discretas. El resultado debe sentirse como un dashboard SaaS contemporáneo y útil, no decorativo.

Las pantallas finales se adaptarán al dominio, accesibilidad, responsive, datos reales y capacidades aprobadas. No se proporcionó una imagen de referencia para versionar como asset documental.

## 5. Jerarquía de decisión

Cuando existan varias soluciones posibles, usar este orden:

```text
1. Correctitud del dominio
        ↓
2. Comprensión del usuario
        ↓
3. Velocidad de la tarea
        ↓
4. Accesibilidad
        ↓
5. Consistencia del sistema
        ↓
6. Estética
```

Una solución más bonita que sacrifica claridad pierde. Una solución ligeramente más lenta que evita un error financiero serio gana.

## 6. Personalidad visual aplicada al producto

| Debe sentirse | No debe sentirse |
| --- | --- |
| Ordenado | Burocrático |
| Profesional | Corporativo frío |
| Moderno | Experimental |
| Cercano | Infantil |
| Sereno | Vacío |
| Preciso | Técnico |
| Natural sutil | Ecológico temático |
| Premium moderado | Lujoso |
| Operativo | ERP pesado |

## 7. Mobile first

Cada flujo importante se diseña primero considerando aproximadamente 390 px de ancho y después se adapta a tablet y desktop.

```text
390 px
Mobile

↓ adaptación

768 px
Tablet

↓ enriquecimiento

1280 / 1440 px
Desktop
```

En desktop pueden aparecer columnas, sidebar persistente, tablas, paneles simultáneos y más contexto, pero el flujo esencial debe seguir siendo posible en móvil.

## 8. Accesibilidad

Objetivo mínimo: **WCAG 2.2 AA**.

Por diseño:

- foco visible;
- navegación por teclado;
- objetivos táctiles adecuados;
- labels visibles;
- contraste suficiente;
- errores asociados al campo;
- color nunca como única señal;
- estructura semántica;
- movimiento reducido cuando corresponda.

La accesibilidad es una propiedad del sistema, no un paso final.

## 9. Regla para nuevas pantallas

Antes de diseñar cualquier pantalla debe poder responderse:

```text
¿Quién la usa?
¿Qué quiere lograr?
¿Dentro de qué Negocio está?
¿Cuál es la acción principal?
¿Qué información necesita para decidir?
¿Qué puede salir mal?
¿Qué estados existen?
¿Qué ocurre después del éxito?
¿Qué ocurre en móvil?
¿Qué depende del backend?
```

Si varias respuestas dependen de un dominio aún no definido, la pantalla puede avanzar como wireframe exploratorio, pero no como diseño final.

## 10. Definition of Done de diseño

Una pantalla no se considera diseñada únicamente porque exista un mockup.

Debe tener, cuando aplique:

```text
Default
Loading
Empty
No results
Success
Validation error
Server error
Conflict
Disabled
Archived
Permission denied
Responsive
Keyboard/focus
```

Y debe especificar acción primaria, acciones secundarias, comportamiento, contenido, validaciones visibles, responsive y componentes del Design System utilizados.

## 11. Fuente de verdad visual

`docs/10-Brand-Book-v1.md` es la fuente de verdad visual vigente para:

- Plus Jakarta Sans;
- paleta Bosque y arcilla;
- `#155C4C` como color primario;
- Lucide;
- tokens de spacing, radius, motion y foco.

`docs/08-Fundamentos-de-Diseno-de-Producto.md` contiene decisiones provisionales anteriores de tipografía y color que deberán reconciliarse posteriormente con el Brand Book.
