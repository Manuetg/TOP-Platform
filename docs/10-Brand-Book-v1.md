# TOP — Brand Book v1

## 1. Estado, propósito y alcance

**Estado:** base de marca aprobada para diseño de producto, pendiente de validación legal de la denominación TOP.

Este Brand Book consolida las decisiones de `09-Brand-Strategy-v1.md` para que la identidad de TOP sea consistente antes de diseñar activos gráficos o pantallas completas. Aplica al producto, onboarding, documentación y comunicaciones de marca dentro del alcance del MVP.

No define capacidades, permisos, reglas de negocio ni comportamiento de frontend. La autorización, el aislamiento por Negocio, los pagos, la disponibilidad y toda regla crítica siguen siendo responsabilidad del backend y de las fuentes de verdad del proyecto.

## 2. Identidad

### Propósito

Dar a quienes gestionan pequeños alojamientos una forma más simple y confiable de ordenar su operación cotidiana.

### Visión de marca

Ser la referencia de operación simple y moderna para pequeños establecimientos turísticos de Paraguay, con una identidad clara y adaptable a Latinoamérica.

### Personalidad

**Moderna y confiable, con un matiz natural controlado.** TOP transmite tecnología útil, no complejidad técnica; hospitalidad sin convertirse en una marca decorativa de turismo.

### Atributos

- Serena: reduce ruido y hace visible lo importante.
- Clara: usa jerarquía, lenguaje directo y estados comprensibles.
- Competente: se siente rigurosa al trabajar con reservas, datos y pagos.
- Cercana: emplea el lenguaje cotidiano del alojamiento, sin condescendencia.
- Contemporánea: evita el aspecto de ERP antiguo y la ornamentación excesiva.

### Tono de comunicación

TOP es directo, amable y específico. Explica qué ocurre, cuál es su impacto y qué puede hacer la persona a continuación. No dramatiza los errores ni usa urgencia artificial.

### Principios de diseño

1. **Contexto visible.** Toda tarea operativa mantiene claro el Negocio activo.
2. **Acción con intención.** Un color de marca y una acción primaria por decisión relevante.
3. **Calma antes que decoración.** Espacio, jerarquía y contenido útil prevalecen sobre adornos.
4. **Precisión accesible.** El estado nunca depende solo del color; contraste y foco son parte del diseño.
5. **Hospitalidad sobria.** La naturaleza y cercanía se expresan como matiz, no mediante clichés visuales.
6. **Móvil sin concesiones.** El sistema se compone para tacto y lectura breve antes de ganar densidad en escritorio.

## 3. Voz y lenguaje

### Cómo habla TOP

- Con español claro, cercano y profesional, comprensible en Paraguay.
- Con verbos de acción y frases cortas.
- Con nombres visibles para el negocio y sus unidades; no con códigos internos.
- Con mensajes que describen resultado y siguiente paso.

### Nivel de formalidad

Profesional y conversacional. Se usa «tu» y verbos en imperativo amable: «Revisa los datos», «Guardar cambios». No se usa voseo en la interfaz base, para conservar consistencia regional; su adaptación futura debe ser una decisión de localización, no una mezcla por pantalla.

### Expresiones que se evitan

| Evitar | Preferir |
| --- | --- |
| «Error 409» como mensaje principal | «No pudimos guardar porque esta información cambió. Revisa los datos e intenta de nuevo.» |
| «Generar booking» | «Crear reserva» |
| «Contexto requerido» | «Selecciona un negocio para continuar.» |
| «Eliminar» para información histórica | «Archivar» o «Anular», cuando la capacidad lo permita. |
| «¡Urgente!» sin una consecuencia real | Explicar la consecuencia concreta. |
| «Oops» o tono informal excesivo | Mensaje claro y respetuoso. |

### Ejemplos de mensajes del sistema

| Situación | Mensaje |
| --- | --- |
| Éxito | «Los cambios se guardaron.» |
| Validación | «Ingresa una fecha de salida posterior a la fecha de entrada.» |
| Error temporal | «No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.» |
| Conflicto o datos actualizados | «Esta información cambió mientras la estabas editando. Actualiza la página para revisarla.» |
| Sin resultados | «No encontramos resultados con estos filtros.» |
| Sin permiso | «No tienes permiso para ver esta información.» |
| Confirmación sensible | «Vas a archivar “Nombre del negocio”. Esta acción conserva su historial.» |

Los ejemplos explican estados de interfaz, no sustituyen validaciones ni exponen detalles internos del backend.

## 4. Paleta definitiva — Bosque y arcilla

La paleta usa color como jerarquía y significado, no como decoración constante. Los contrastes son objetivos contra `Surface` blanco; toda combinación real debe verificarse antes de implementarse. El Accent no se usa como texto pequeño sobre blanco.

| Rol / token | HEX | Uso | Accesibilidad y contraste esperado | Ejemplo de aplicación |
| --- | --- | --- | --- | --- |
| Primary / `brand-700` | `#155C4C` | Acción primaria, enlaces de prioridad y foco. | ≈7:1 sobre blanco; AA para texto normal. | «Guardar cambios», anillo de foco. |
| Secondary / `brand-secondary-800` | `#29434A` | Navegación activa, títulos de sección y datos secundarios destacados. | ≈10:1 sobre blanco; AAA. | Encabezado de navegación o gráfico no semántico. |
| Accent / `accent-600` | `#B85C38` | Énfasis cálido no crítico. | Usar en rellenos, iconos o texto grande; no como texto pequeño sin validación. | Marcador editorial, dato destacado no financiero. |
| Background / `neutral-25` | `#F7F8F5` | Fondo de página. | No contiene texto por sí mismo; combinar con texto principal. | Área detrás de contenido. |
| Surface / `neutral-0` | `#FFFFFF` | Formularios, tarjetas, tablas y diálogos. | Base para contraste alto. | Contenedor de una reserva. |
| Border / `neutral-200` | `#D9E1DD` | Divisores, bordes de controles y separación estructural. | Objetivo ≥3:1 frente a Surface para componentes no textuales. | Contorno de input en reposo. |
| Text Primary / `neutral-950` | `#17201D` | Texto, cifras y títulos principales. | ≈16:1 sobre blanco; AAA. | Total, nombre de reserva, encabezado. |
| Text Secondary / `neutral-700` | `#4F5B56` | Ayuda, metadatos y etiquetas secundarias. | ≈7:1 sobre blanco; AA. | Fecha de actualización, texto de apoyo. |
| Success / `success-700` | `#177245` | Resultados positivos y estados correctos. | ≈5.7:1 sobre blanco; AA. Nunca es la única señal. | Mensaje de guardado exitoso con icono y texto. |
| Warning / `warning-800` | `#8A4B08` | Advertencias que requieren revisión. | ≈6.5:1 sobre blanco; AA. | Aviso de datos pendientes. |
| Error / `error-700` | `#B42318` | Errores y acciones destructivas. | ≈6.5:1 sobre blanco; AA. | Campo inválido, acción «Archivar». |
| Info / `info-700` | `#175CD3` | Ayuda e información contextual. | ≈6.2:1 sobre blanco; AA. | Alerta informativa. |

### Reglas semánticas

- Primary no significa «éxito» y Success no reemplaza la acción primaria.
- Warning, Error, Info y Success siempre incluyen texto y, cuando aporta claridad, icono.
- Los fondos suaves de estado se derivarán posteriormente de cada semántica; no se inventan valores nuevos por pantalla.
- El color no decide disponibilidad, permisos, estados financieros ni ninguna regla de negocio.

## 5. Tipografía definitiva

### Decisión

Se aprueba **Plus Jakarta Sans** como familia tipográfica única de interfaz, con fallback de sistema. Mantiene buena legibilidad móvil y una voz humana medida sin debilitar dashboards, tablas o formularios. Inter continúa como contingencia técnica, no como segunda familia de uso simultáneo.

Los números de importes, reservas, calendarios y tablas deben usar cifras tabulares cuando estén disponibles. La tipografía no codifica significados de estado por sí sola.

| Estilo | Tamaño / interlineado | Peso | Uso |
| --- | --- | --- | --- |
| Display | 32 / 40 px | 700 | Título de una vista principal; no para datos densos. |
| H1 | 24 / 32 px | 700 | Página, diálogo mayor. |
| H2 | 20 / 28 px | 700 | Sección primaria. |
| H3 | 16 / 24 px | 600 | Tarjeta, subsección o título de tabla. |
| Body | 16 / 24 px | 400 | Lectura, formularios y mensajes. |
| Body compact | 14 / 20 px | 400 | Tablas, listas y navegación secundaria. |
| Label | 14 / 20 px | 600 | Etiquetas de campos y acciones. |
| Caption | 12 / 16 px | 500 | Metadatos complementarios; nunca información crítica aislada. |
| Numeric | 14–24 / proporcional | 600 | Importe, indicador o número visible; con cifras tabulares. |

### Reglas de aplicación

- Formularios: Body para entrada y Label para etiquetas; ayuda en Caption solo como soporte.
- Tablas: Body compact, encabezados Label, cifras alineadas por su borde final y con números tabulares.
- Dashboards: Numeric destaca el indicador; H3 o Label explica qué representa; no usar tamaños de marketing.
- Móvil: el texto base no baja de 16 px en campos editables; se prioriza line-height de 24 px para tacto y lectura.
- No usar más de tres pesos visibles en una misma vista habitual: 400, 600 y 700.

## 6. Design tokens iniciales

Estos tokens son nomenclatura de diseño, no código ni contrato técnico.

### Espaciado

| Token | Valor | Uso |
| --- | ---: | --- |
| `space-1` | 4 px | Ajuste fino, icono–texto. |
| `space-2` | 8 px | Separación compacta. |
| `space-3` | 12 px | Controles relacionados. |
| `space-4` | 16 px | Padding de controles y ritmo base. |
| `space-5` | 24 px | Secciones pequeñas. |
| `space-6` | 32 px | Separación de bloques. |
| `space-7` | 40 px | Cabeceras de contenido. |
| `space-8` | 48 px | Secciones principales. |
| `space-10` | 64 px | Pausas de página en escritorio. |

### Bordes, radios, sombras y elevación

| Categoría | Tokens | Uso |
| --- | --- | --- |
| Borde | `border-default: 1 px`, `border-strong: 2 px` | `strong` solo para foco o énfasis estructural. |
| Radio | `radius-sm: 6 px`, `radius-md: 8 px`, `radius-lg: 12 px`, `radius-xl: 16 px` | Controles: md; tarjetas y diálogos: lg; evitar radios decorativos mayores. |
| Sombra | `shadow-0: ninguna`, `shadow-1: 0 1px 2px rgba(23,32,29,.08)`, `shadow-2: 0 8px 24px rgba(23,32,29,.12)` | Bordes antes que sombras; shadow-2 solo en diálogos o superficies flotantes. |
| Elevación | `elevation-0` base, `elevation-1` superficie elevada, `elevation-2` modal o menú | Máximo dos niveles visibles a la vez. |

### Breakpoints y contenedores

| Token | Rango | Regla |
| --- | --- | --- |
| `mobile` | 0–767 px | Una columna, navegación compacta, prioridad de tarea. |
| `tablet` | 768–1023 px | Dos columnas cuando la lectura no se comprometa. |
| `desktop` | 1024–1439 px | Sidebar y vistas de datos más densas. |
| `wide` | ≥1440 px | Más aire, no más jerarquía ni acciones simultáneas. |

### Movimiento, opacidad y foco

| Token | Valor | Uso |
| --- | --- | --- |
| `motion-fast` | 120 ms | Hover, iconos, cambios menores. |
| `motion-base` | 180 ms | Menús, tooltips y feedback de controles. |
| `motion-slow` | 240 ms | Diálogos y transiciones de panel. |
| Curva | `ease-out` para entrada, `ease-in-out` para cambios de estado | Evitar animación ornamental o que bloquee tareas. |
| `opacity-disabled` | 0.45 | Estado visual; conservar contraste y no depender solo de opacidad. |
| `opacity-overlay` | 0.40 | Fondo de diálogo. |
| `focus-ring` | 2 px `#155C4C` + separación exterior 2 px | Visible por teclado sobre Surface y Background; nunca quitarlo. |

### Estados base

| Estado | Tratamiento |
| --- | --- |
| Reposo | Surface, borde default y texto primario. |
| Hover | Cambio leve de superficie o borde; no alterar la estructura. |
| Activo | Confirmación visual breve y clara. |
| Foco | `focus-ring` visible, independiente de hover. |
| Deshabilitado | Opacidad moderada, cursor y explicación cuando sea necesario. |
| Error | Error semántico + texto específico junto al control. |
| Cargando | Conserva el layout; muestra progreso sin duplicar la acción. |

## 7. Iconografía

### Decisión

Se aprueba **Lucide regular** como única biblioteca de iconos. Su trazo neutral acompaña la identidad de TOP sin imponer Material, Tailwind ni una estética excesivamente técnica.

### Tamaños y grosor

| Contexto | Tamaño | Regla |
| --- | ---: | --- |
| Dentro de controles | 16 px | Para botón compacto o campo. |
| Interfaz base | 20 px | Tamaño estándar de acción y lista. |
| Navegación principal | 24 px | Sidebar o navegación móvil. |
| Estado vacío / ilustración funcional | 32–40 px | Solo con texto y siguiente paso. |

Usar el grosor regular de la biblioteca sin mezclar pesos ni familias. Mantener un área táctil mínima de 44 × 44 px aunque el glifo mida 20 o 24 px.

### Reglas de uso y accesibilidad

- El icono complementa una etiqueta en acciones críticas, destructivas o ambiguas.
- Los botones solo con icono requieren nombre accesible, tooltip y significado ampliamente reconocible.
- No usar iconos para reemplazar texto en formularios, estados financieros, permisos o disponibilidad.
- No usar más de un icono para representar el mismo concepto en distintos módulos.
- Los iconos informativos cumplen contraste de 3:1 como mínimo frente a la superficie y no son el único indicador de estado.

## 8. Grid y layout

| Contexto | Columnas | Margen lateral | Gutter | Ancho máximo de contenido |
| --- | ---: | ---: | ---: | ---: |
| Mobile | 4 | 16 px | 16 px | 100% menos márgenes |
| Tablet | 8 | 24 px | 20 px | 720 px para flujos; 960 px para datos |
| Desktop | 12 | 32 px | 24 px | 1200 px |
| Wide | 12 | 48 px | 24 px | 1360 px |

### Reglas de composición

- Formularios y lectura: ancho de línea contenido; no ocupar el máximo por defecto.
- Datos, calendario y dashboard: pueden utilizar el ancho disponible hasta el máximo definido.
- Las tarjetas no se usan como una grilla universal: agrupan información con una razón clara.
- En móvil, tabla y calendario deben ofrecer una lectura alternativa o patrón de adaptación; no se resuelven con reducción de tipografía.

## 9. Lenguaje visual de los elementos del producto

Estas definiciones establecen apariencia y jerarquía; no especifican pantallas ni comportamiento de dominio.

| Elemento | Lenguaje visual |
| --- | --- |
| Cards | Surface blanca, `radius-lg`, borde `neutral-200`, `shadow-0` por defecto. La elevación se reserva a selección, menú o diálogo. |
| Formularios | Etiquetas visibles, grupos cortos, ayuda contextual y errores cercanos al campo. Surface limpia y una acción primaria por bloque. |
| Tablas | Estructura plana, encabezado legible, divisores suaves, filas escaneables y cifras alineadas. En móvil pasan a lista de pares etiqueta–valor cuando corresponda. |
| Dashboard | Resumen sobrio, jerarquía de dato antes de gráfica y color semántico con etiqueta. No usar métricas decorativas ni más tarjetas de las necesarias. |
| Calendario | Fondo claro, divisores discretos, eventos con etiqueta y color + texto/patrón. La densidad aumenta en escritorio sin ocultar información esencial. |
| Modales | Surface blanca, `radius-lg`, `shadow-2`, título claro, contexto y acción primaria al final. Overlay de `opacity-overlay`; foco contenido. |
| Navegación | Fondo sobrio, icono + etiqueta, destino activo con contraste y no solo color. El Negocio activo siempre es visible en el shell. |

## 10. Revisión crítica de Brand Strategy v1

La estrategia es consistente con el propósito y el MVP: prioriza una marca de operación, no una plataforma turística promocional. No se modifica `09-Brand-Strategy-v1.md` porque no se detectó una contradicción material.

Precisiones incorporadas por este Brand Book:

- Las decisiones antes recomendadas se consolidan como base de diseño de producto.
- La aprobación no reemplaza la verificación legal de «TOP» ni disponibilidad de dominio.
- «Bosque y arcilla» se vuelve la paleta de referencia; su uso final exige pruebas de contraste por combinación.
- La promesa de «inteligente» se expresa como claridad y utilidad, sin sugerir IA como funcionalidad del MVP.

## 11. Próximo sprint: identidad gráfica

El siguiente sprint debe trabajar solo sobre propuestas gráficas de identidad, en este orden:

1. Logo.
2. Isotipo.
3. Imagotipo.
4. Variantes claras.
5. Variantes oscuras.
6. Versiones monocromáticas.
7. Área de seguridad.
8. Tamaños mínimos.

Antes de aprobar cualquier propuesta, validar legibilidad en 16–24 px, contraste sobre Background y Surface, reproducción monocromática, diferenciación frente a marcas del mercado y disponibilidad legal. No se diseñarán pantallas completas como parte de ese sprint.

## 12. Decisiones pendientes y riesgos

### Pendientes

- Verificación legal y de dominio para TOP.
- Pruebas de percepción con propietarios, recepcionistas y administradores.
- Validación de contraste de combinaciones reales cuando existan componentes.
- Guía de fotografía e ilustración, incluidos derechos de uso.
- Activos de logo e identidad gráfica del siguiente sprint.

### Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Verde interpretado como rural o ambiental | Predominio de superficies neutras y secundario azul petróleo. |
| Acento arcilla usado como texto no accesible | Restringirlo a énfasis no crítico hasta verificar contraste. |
| Sobrecargar la interfaz con identidad turística | Reservar fotografía e ilustración para contextos no operativos. |
| Tratar los tokens como reglas de negocio | Mantenerlos como lenguaje visual y respetar la validación backend. |
