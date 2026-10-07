# language: es
@financeReal @financePrivateEvidence
Característica: Comprobantes privados de gastos con autorización vigente
  Un archivo enriquece evidencia; no cambia importes ni publica URLs del objeto.
  El proxy revalida el OWNER y el negocio en cada lectura y cada reintento.

  Antecedentes:
    Dado FV existe un gasto propio sin evidencia y el proveedor privado sintético autorizado

  @FIN032
  Escenario: PDF con nombre Unicode y reintento conserva un archivo exacto
    Cuando FV sube el PDF como "comprobante ñ.pdf" y repite la misma intención
    Entonces FV conserva un archivo con hash exacto versión de gasto 2 y metadatos privados
    Y FV descarga los mismos bytes con nombre original y headers privados
    Y FV la referencia del gasto sigue vacía y su evidencia actual ya está cubierta
    Y FV elimina sólo los objetos descartables de su fixture sintético

  @FIN032
  Escenario: Límite efectivo acepta 2 MiB y rechaza un byte adicional antes de persistir
    Cuando FV sube un PDF válido de exactamente 2097152 bytes
    Y FV intenta otro archivo de 2097153 bytes con la versión actual
    Entonces FV recibe 413 y conserva un archivo una request y versión 2
    Y FV elimina sólo los objetos descartables de su fixture sintético

  @FIN032
  Escenario: MIME declarado no puede ocultar un contenido distinto
    Cuando FV presenta PNG como PDF
    Entonces FV recibe 400 sin archivo objeto ni incremento de versión
    Y FV elimina sólo los objetos descartables de su fixture sintético

  @FIN032
  Esquema del escenario: Capabilities heredadas no permiten evidencias privadas
    Dado FV el OWNER ya incorporó el PDF privado
    Cuando FV un usuario <rol> intenta listar descargar y subir evidencia
    Entonces FV las tres acciones responden 403 sin metadatos ni archivo adicional
    Y FV elimina sólo los objetos descartables de su fixture sintético

    Ejemplos:
      | rol          |
      | ADMIN        |
      | RECEPTIONIST |
      | VIEWER       |

  @FIN032
  Escenario: El ID de archivo ajeno queda oculto y la descarga anónima no se admite
    Dado FV el OWNER ya incorporó el PDF privado
    Cuando FV el OWNER ajeno consulta ese ID en su negocio y otro cliente omite JWT
    Entonces FV observa 404 equivalente al ID inexistente y 401 anónimo sin bytes
    Y FV elimina sólo los objetos descartables de su fixture sintético

  @FIN032
  Escenario: Revocar membresía deniega descarga y replay sin borrar el soporte
    Dado FV el OWNER ya incorporó el PDF privado
    Cuando FV revoca su membresía y conserva el JWT anterior
    Entonces FV descarga y replay responden 403 y el archivo privado permanece
    Y FV elimina sólo los objetos descartables de su fixture sintético

  @FIN032
  Escenario: Cambiar bytes con la misma intención no crea otro hecho ni otro objeto
    Dado FV el OWNER ya incorporó el PDF privado
    Cuando FV reintenta la misma clave con otro PDF válido
    Entonces FV recibe 409 con un archivo y su hash original intactos
    Y FV elimina sólo los objetos descartables de su fixture sintético
