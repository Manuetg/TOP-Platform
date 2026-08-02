# TOP — Fundamentos de diseño de producto

## 1. Propósito y alcance

Este documento establece la base de experiencia, interfaz y handoff para el MVP de TOP. Aplica a Negocio, Identidad y Acceso, Recursos, Precios, Disponibilidad, Contactos, Reservas, Pagos, Bloques, Calendario y Dashboard.

No define reglas de negocio ni autoriza capacidades. Las reglas, permisos y validaciones se resuelven en backend según `03-Domain-Bible.md`, `04-Business-Rules.md` y el backlog. Este documento define cómo comunicar esos resultados de forma clara, accesible y rápida.

### Objetivo de experiencia

Permitir que una persona propietaria, administradora o recepcionista complete una tarea operativa con confianza, aun usando un teléfono y sin conocer jerga técnica.

### Principios de UX y UI

1. **El contexto antes que la acción.** Toda pantalla operativa expone el Negocio activo; el usuario nunca debe adivinar dónde está trabajando.
2. **Velocidad con confirmación.** Las tareas frecuentes requieren pocos pasos, mientras que acciones irreversibles o sensibles requieren revisión explícita.
3. **Lenguaje del alojamiento.** La interfaz nombra la unidad como cabaña, habitación, domo, parcela u otro término configurado; evita mostrar el concepto interno `Resource`.
4. **Estado visible, no inferido.** Disponibilidad, permisos, carga, resultado y errores deben ser evidentes en la interfaz, sin depender solo del color.
5. **Móvil primero, densidad progresiva.** En móvil se priorizan lista, búsqueda y acciones principales; la vista de mayor densidad se agrega desde tablet y escritorio.
6. **El sistema informa; el backend decide.** La UI previene errores previsibles y explica rechazos, pero nunca promete ni determina reglas críticas.
7. **Historial merece respeto.** Datos financieros y operativos históricos se muestran como preservados; la UI no usa lenguaje ni patrones de eliminación definitiva cuando el dominio no lo permite.

## 2. Arquitectura de información y navegación

### Navegación principal del MVP

| Área | Propósito | Prioridad de acceso |
| --- | --- | --- |
| Inicio | Resumen operativo aprobado por Dashboard. | Principal |
| Calendario | Consultar la operación por fecha y recurso. | Principal |
| Reservas | Crear, buscar y consultar reservas. | Principal |
| Disponibilidad | Consultar recursos disponibles para un período. | Principal |
| Recursos | Administrar unidades reservables. | Secundaria |
| Precios | Administrar planes y reglas autorizadas. | Secundaria |
| Pagos | Registrar y consultar pagos de reservas. | Secundaria |
| Configuración del negocio | Consultar y actualizar datos del Negocio. | Secundaria, según rol |
| Usuarios y acceso | Gestión de usuarios, membresías y roles cuando la capacidad sea aprobada. | Secundaria, según rol |

La presencia de un ítem no concede autorización. Un usuario sin permiso no ve acciones que no puede realizar; si llega a una URL autorizable sin acceso, recibe el estado «No tienes permiso para ver esta información» con una salida segura al área permitida.

### Patrón de shell responsive

- **Móvil (< 768 px):** barra inferior con Inicio, Calendario, Reservas y Más. La acción primaria contextual se mantiene visible sin tapar contenido.
- **Tablet (768–1023 px):** navegación lateral compacta o barra superior según espacio; nunca se oculta el Negocio activo.
- **Laptop y escritorio (≥ 1024 px):** sidebar persistente, encabezado con selector de Negocio y contenido centrado con ancho legible.
- **Cambio de Negocio:** acción explícita desde el encabezado. Cambia el contexto de pantalla, no los datos de una entidad existente.

### Navegación por tarea

Las rutas y endpoints son **Pendiente de definición**. El handoff debe conservar esta jerarquía conceptual:

```text
Acceso
  Iniciar sesión
    Elegir Negocio (solo si hay más de una membresía)
      Área operativa del Negocio activo
        Inicio | Calendario | Reservas | Disponibilidad
        Gestión: Recursos | Precios | Pagos
        Configuración: Negocio | Usuarios y acceso
```

## 3. Lenguaje de producto

### Voz

Clara, cercana y profesional. Se usan oraciones cortas, verbos de acción y español neutro comprensible en Paraguay. No se usan anglicismos, códigos internos ni tono culpabilizador.

| Preferir | Evitar |
| --- | --- |
| «Crear reserva» | «Generar booking» |
| «Guardar cambios» | «Actualizar registro» |
| «No pudimos guardar los cambios. Intenta de nuevo.» | «Error 409» como único mensaje |
| «Selecciona un negocio para continuar» | «Contexto requerido» |
| «Fuera de servicio» | «Disabled» |

### Convenciones

- Etiquetas y botones comienzan con verbo: «Crear usuario», «Registrar pago», «Archivar negocio».
- Los mensajes explican qué ocurrió y el siguiente paso posible.
- Los identificadores internos UUID, hashes, tokens y `businessNumber` no se muestran.
- Los importes presentan la moneda configurada por el Negocio. Formato exacto y símbolo: **Pendiente de definición**.
- Las fechas muestran una representación localizada; la zona horaria del Negocio gobierna la presentación.

## 4. Flujos prioritarios

### 4.1 Crear usuario administrativo — IAM-004

**Actor:** persona autorizada para gestionar usuarios. La matriz de permisos detallada está Pendiente de definición.

1. Ingresa a Usuarios y acceso y elige «Crear usuario».
2. Completa el email y la información que el contrato aprobado requiera. Los campos mínimos adicionales y la política de contraseña están Pendiente de definición.
3. Revisa el contexto de Negocio visible antes de continuar.
4. La UI envía la solicitud y muestra progreso sin exponer credenciales.
5. Éxito: confirma la creación y ofrece volver a la lista o crear otro usuario.
6. Error: conserva los datos no sensibles y muestra un mensaje accionable. Si el email ya existe, no revela afiliaciones ni datos de otros Negocios.

**Decisión UX:** no hay «Registrarme» ni acceso público. La creación es una acción administrativa, no una pantalla de adquisición.

### 4.2 Membresía Usuario–Negocio — propuesta pendiente

La capacidad explícita para asociar Usuario, Negocio y rol aún no está aprobada en el backlog. Por lo tanto, no se debe implementar ni presentar como disponible.

Cuando se apruebe, el patrón recomendado es una sección «Accesos al negocio» dentro del detalle del usuario: una fila por membresía con Negocio y rol. El alta y edición requieren revisión del contexto antes de confirmar. No se presupone una membresía única ni se diseñan estados individuales de membresía, que siguen Pendiente de definición.

### 4.3 Inicio de sesión — IAM-001

1. La persona ingresa email y contraseña.
2. Envía el formulario con botón «Iniciar sesión» y estado de carga.
3. Credenciales válidas: se reciben las membresías disponibles; la UI no elige un Negocio automáticamente.
4. Una membresía: se presenta una pantalla breve de confirmación de acceso con el Negocio y una acción explícita «Continuar a [Nombre del negocio]».
5. Varias membresías: se muestra «Elige el negocio con el que quieres trabajar», con nombre comercial y rol por opción.
6. Sin membresías: se muestra «Tu cuenta no tiene acceso a ningún negocio. Contacta a la persona administradora.»

Estados requeridos:

| Situación | Mensaje | Acción |
| --- | --- | --- |
| Credenciales inválidas | «El email o la contraseña no son correctos.» | Corregir y volver a intentar |
| Usuario deshabilitado | «Tu cuenta está deshabilitada. Contacta a la persona administradora.» | Sin reintento automático |
| Sin acceso a Negocios | «Tu cuenta no tiene acceso a ningún negocio.» | Contactar a administración |
| Error temporal | «No pudimos iniciar sesión. Revisa tu conexión e intenta de nuevo.» | Reintentar |

Recuperación de contraseña, Refresh Token y Logout no pertenecen al diseño de IAM-001. Permanecen fuera de este flujo hasta contar con definición aprobada.

### 4.4 Negocio — capacidades Business terminadas

Las pantallas se alinean con BUS-001 a BUS-005:

- **Lista de negocios:** nombre comercial, ubicación resumida y estado; no se muestra `businessNumber`.
- **Crear y actualizar:** formulario agrupado en Identidad, Ubicación, Configuración y Contacto. Campos obligatorios exactos: según contrato aprobado.
- **Detalle:** encabezado con nombre comercial y estado, seguido de los datos configurables autorizados.
- **Archivar:** diálogo de confirmación con nombre del Negocio, consecuencia clara y acción destructiva diferenciada. No se usa «Eliminar».

El diseño no asume transiciones de estado más allá de las capacidades ya respaldadas; cualquier estado o transición no definida se etiqueta **Pendiente de definición**.

## 5. Sistema de diseño inicial

El sistema es deliberadamente pequeño: se amplía al validar flujos, no por anticipación.

### Tokens

| Categoría | Decisión inicial | Uso |
| --- | --- | --- |
| Tipografía | Inter, con fallback del sistema. | Alta legibilidad en UI y soporte amplio de caracteres. |
| Escala tipográfica | 12, 14, 16, 20, 24, 32 px; altura de línea mínima 1.4. | Texto operativo prioriza 14–16 px. |
| Espaciado | Escala de 4 px: 4, 8, 12, 16, 24, 32, 40, 48. | Separación, padding y ritmo. |
| Radio | 8 px controles; 12 px contenedores. | Cercano y moderno, sin exceso decorativo. |
| Elevación | 0, 1 y 2 niveles; borde antes que sombra. | Jerarquía sobria. |
| Breakpoints | 0–767, 768–1023, 1024–1439, ≥1440 px. | Composición, no cambio de capacidades. |

### Color provisional

La identidad visual completa (logo, paleta final y usos de marca) requiere un entregable de Branding separado. Para que el producto pueda diseñarse de forma consistente, se adopta una base provisional accesible:

| Token | Valor | Uso |
| --- | --- | --- |
| `brand/700` | `#0F5C4A` | Acción primaria y foco sobre superficies claras. |
| `brand/50` | `#EAF5F0` | Fondos sutiles de marca. |
| `neutral/950` | `#17201D` | Texto principal. |
| `neutral/600` | `#58615E` | Texto secundario. |
| `neutral/100` | `#EEF1EF` | Bordes y superficies suaves. |
| `success/700` | `#18794E` | Éxito, acompañado de texto o icono. |
| `warning/800` | `#8A4B08` | Advertencia, acompañado de texto o icono. |
| `danger/700` | `#B42318` | Error y acciones destructivas. |
| `info/700` | `#175CD3` | Información. |

**Alternativas evaluadas:** azul SaaS genérico ofrece familiaridad pero diluye el vínculo con hospitalidad y naturaleza; verde intenso transmite naturaleza y confianza, aunque debe usarse con moderación para no parecer un producto ambiental. Se recomienda el verde sobrio como primario provisional, con neutrales cálidos y estados semánticos independientes.

### Iconografía e imágenes

- Biblioteca recomendada: **Lucide**. Ventajas: trazo consistente, licencia permisiva, gran cobertura y buena adaptación a 20/24 px. Desventaja: necesita una curaduría para evitar variantes redundantes.
- Los iconos acompañan etiquetas en acciones críticas; no reemplazan texto cuando el significado pueda ser ambiguo.
- Las fotografías se reservan para onboarding, estados vacíos contextuales o marketing; no para controles operativos. Ilustraciones, si se introducen, serán geométricas y minimalistas, con el mismo trazo y paleta. No mezclar fotografía, 3D y personajes ilustrados en una misma pantalla.

### Componentes mínimos y especificación

| Componente | Variantes / estados | Regla de uso y accesibilidad |
| --- | --- | --- |
| Botón | Primario, secundario, terciario, destructivo; pequeño, mediano, grande; normal, hover, foco, deshabilitado, carga. | Un primario por región de decisión; nombre accesible con el verbo de la acción. |
| Campo de texto y textarea | Etiqueta, ayuda, requerido, error, deshabilitado, solo lectura. | Etiqueta visible; error asociado programáticamente; no depender del placeholder. |
| Select / autocompletar | Cerrado, abierto, seleccionado, error, vacío. | Navegable por teclado; búsqueda para listas largas. |
| Checkbox, radio y switch | Normal, foco, seleccionado, deshabilitado, error. | Checkbox para múltiples; radio para una opción; switch solo para cambio inmediato y reversible. |
| Tarjeta | Informativa, seleccionable, resumen. | No simular botón si contiene acciones distintas; foco visible si es interactiva. |
| Lista / tabla adaptable | Móvil en lista; tabla desde espacio suficiente. | Encabezados de tabla reales; acciones por fila con etiqueta accesible. |
| Badge de estado | Neutro, éxito, advertencia, error, información. | Texto del estado siempre visible; color como apoyo. |
| Diálogo de confirmación | Informativo, confirmación, destructivo. | Foco atrapado, Escape para cerrar salvo operación crítica, foco vuelve al disparador. |
| Alertas y toast | Éxito, error, advertencia, información. | Errores importantes persisten; toast no es único canal para contenido crítico. |
| Calendario | Consulta, selección de rango, disponibilidad. | Alternativa textual para fechas; no depender solo de color en celdas. |
| Skeleton / vacío / sin resultados | Contextual por módulo. | Explican el siguiente paso; no usar una pantalla vacía sin orientación. |

## 6. Estados transversales

| Estado | Patrón |
| --- | --- |
| Carga inicial | Skeleton estructural que refleja el contenido esperado; evitar bloqueos completos prolongados. |
| Guardando | Botón con progreso, prevención de doble envío y conservación de contexto. |
| Éxito | Confirmación cercana a la acción y enlace a la entidad cuando sea útil. |
| Error de validación | Mensaje junto al campo y resumen al inicio para formularios extensos. |
| Error de servidor / concurrencia | Explicar que los datos pudieron cambiar; permitir recargar o revisar, sin prometer que se guardó. |
| Vacío | Propósito del área, explicación breve y una sola acción principal si existe capacidad autorizada. |
| Sin resultados | Mantener filtros y ofrecer ajustar búsqueda; no confundir con estado vacío. |
| Permiso insuficiente | Mensaje claro, sin revelar datos restringidos, con salida a una sección permitida. |

## 7. Accesibilidad y calidad responsive

El objetivo mínimo es WCAG 2.2 AA.

- Contraste de texto normal igual o superior a 4.5:1; texto grande e iconos informativos, 3:1 como mínimo.
- Todos los flujos son operables con teclado y muestran foco visible de alto contraste.
- Objetivos táctiles de al menos 44 × 44 px cuando el contexto móvil lo permita.
- El orden de foco sigue el orden visual y de lectura; diálogos gestionan foco correctamente.
- Los campos tienen etiqueta, instrucciones y errores expuestos a tecnologías asistivas.
- El color nunca es el único indicador de estado; calendario, badges y gráficos incluyen texto, icono o patrón.
- Las tablas se transforman a listas con pares etiqueta–valor en móvil; no se fuerza desplazamiento horizontal salvo que conservar la relación tabular sea esencial.
- Las acciones destructivas se separan visualmente y requieren confirmación cuando la capacidad lo exija.

## 8. Especificación de handoff

Cada pantalla de alta fidelidad deberá incluir: nombre y propósito, rol autorizado, contexto de Negocio, estados, validaciones visibles, comportamiento responsive, contenido de error, navegación posterior y componentes/tokens usados.

El frontend implementa interacción y presentación; autorización, aislamiento de datos, disponibilidad, reglas de precio, auditoría, concurrencia e integridad se validan en backend.

## 9. Decisiones, supuestos y pendientes

### Decisiones documentadas

- Navegación móvil con cuatro destinos principales y agrupación del resto en «Más».
- Selección explícita de Negocio después del login, incluida la confirmación para una sola membresía.
- Lenguaje de unidades configurable por tipo de negocio, sin exponer `Resource`.
- Inter como tipografía de UI, Lucide como biblioteca de iconos y verde sobrio como color provisional.
- Sistema mínimo de componentes, ampliable según flujos validados.

### Supuestos de diseño

- Los nombres comerciales de los Negocios son suficientemente distinguibles para la selección de contexto. Si no lo fueran, el criterio de diferenciación está Pendiente de definición.
- La interfaz podrá recibir resultados de autorización y de errores del backend para mostrarlos con los patrones definidos.
- Los campos exactos de creación de User y los contratos de API aún no están cerrados, por lo que los wireframes no deben fijar validaciones de dominio no aprobadas.

### Pendientes que bloquean detalle de alta fidelidad

- Aprobación y contrato de la capacidad Usuario–Negocio–rol propuesta como IAM-009.
- Política de contraseña, normalización de email y transiciones de estado de User.
- Matriz detallada de permisos y navegación visible por rol.
- Definición final de identidad de marca, formato monetario y catálogos iniciales de recursos/amenidades.
- Reglas pendientes de reservas, pagos, bloques, disponibilidad y Dashboard indicadas en la documentación de dominio.

## 10. Próximo entregable recomendado

Una vez aprobada la capacidad de membresías y definidos sus campos mínimos, elaborar wireframes mobile first y especificaciones de interacción para IAM-004, membresías e IAM-001. En paralelo, el flujo Business puede pasar a alta fidelidad porque sus cinco capacidades ya están completadas, sin alterar reglas ni contratos.
