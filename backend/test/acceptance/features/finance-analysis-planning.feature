# language: es
@financeReal @financeAnalysisPlanning
Característica: Costos, metas y decisiones de caja con fuentes financieras reales
  El OWNER distingue costos registrados, compromisos pendientes y escenarios manuales.
  Cada importe PYG conserva su fuente, su versión y sus destinos, incluido sin asignar.

  Antecedentes:
    Dado AN existe el harness financiero real con OWNER vigente y dos negocios aislados

  @FIN023
  Escenario: Golden C distribuye 500001 con residuo explícito y conserva las versiones
    Dado AN registra un costo común de 500001 y dos recursos propios
    Cuando AN asigna 50 por ciento al primer recurso y 25 por ciento al segundo
    Entonces AN observa destinos 250000 y 125000 más 125001 sin asignar
    Y AN repetir la intención conserva una asignación y otra intención con versión vieja responde 409

  @FIN024
  Escenario: Resultado relaciona servicio certificado, costo directo y costo común sin fabricar ingresos
    Dado REC existe una estancia del 29 de septiembre al 3 de octubre por 1200000 con ingreso y salida manuales
    Y REC el OWNER certifica explícitamente las cuatro noches de 300000
    Y AN registra un costo común de 500001 y dos recursos propios
    Cuando AN asigna 50 por ciento al primer recurso y 25 por ciento al segundo
    Y AN registra costo directo de 100000 contra el recurso certificado
    Entonces AN septiembre conserva ingreso certificado 600000 y costo total 600001 con resultado -1
    Y AN el recurso certificado obtiene 250000 y los otros costos quedan en sus destinos

  @FIN025
  Escenario: Costo real sustituye estimación y trabajo OWNER permanece separado
    Dado AN registra personal estimado de 120000
    Cuando AN lo sustituye con documento real de 150000 y declara trabajo OWNER de 80000
    Entonces AN observa costo real 150000 estimación seleccionada 0 y trabajo OWNER 80000
    Y AN un personal sin importe conserva null y cobertura desconocida

  @FIN026
  Escenario: Meta aprobada intacta y previsión explícita de costos conocidos
    Dado AN aprueba meta mensual de 1000000
    Y AN registra costo real de 600000 y compromiso pendiente de 600000
    Cuando AN consulta comparación sin elegir previsión
    Entonces AN la previsión y su desviación son null con meta 1000000 intacta
    Cuando AN elige previsión real más compromisos pendientes
    Entonces AN observa previsión 1200000 desviación 200000 y ningún movimiento de caja nuevo

  @FIN027
  Escenario: Conversión parcial cuenta gasto y pendiente una sola vez
    Dado AN aprueba meta mensual de 1000000
    Y AN registra compromiso de 900000 para septiembre
    Cuando AN convierte 600000 en gasto y repite la misma intención
    Entonces AN observa real 600000 pendiente 300000 y suma prevista 900000
    Y AN existen un gasto y una conversión sin liquidación de caja
    Y AN convertir otros 400000 responde 400 sin filas parciales

  @FIN028
  Escenario: Antigüedad usa obligación pendiente después del pago parcial
    Dado FIN declara apertura de banco por 1000000
    Y AN registra obligación vencida de 900000
    Cuando AN paga 300000 de la obligación con fecha actual
    Entonces AN la antigüedad conserva sólo 600000 pendientes de esa obligación

  @FIN028
  Escenario: Golden de caja proyectada no se registra como pago real
    Dado FIN declara apertura de banco por 1000000
    Y AN registra obligación vencida de 900000
    Cuando AN propone salida futura de 900000 desde la fuente real del servidor
    Entonces AN observa caja registrada 1000000 proyección 100000 y cero liquidaciones
    Y AN refrescar sin escenario conserva proyección base 1000000

  @FIN031
  Escenario: Alertas derivadas conservan identidad y desaparecen al liquidar la obligación
    Dado FIN declara apertura de banco por 1000000
    Y AN registra obligación vencida de 900000
    Cuando AN consulta dos veces las alertas del mismo corte
    Entonces AN la alerta vencida conserva su identidad y destino de gasto
    Cuando AN paga 900000 de la obligación con fecha actual
    Entonces AN refrescar elimina esa alerta porque el saldo pendiente es cero

  @FIN031
  Escenario: Cobertura D1 pendiente muestra la noche real sin fabricar servicio
    Dado REC existe una estancia del 29 de septiembre al 3 de octubre por 1200000 con ingreso y salida manuales
    Cuando REC el OWNER certifica sólo la noche del 29 de septiembre
    Entonces AN las alertas conservan la noche 30 de septiembre pendiente de esa reserva

  @FIN025 @FIN026 @FIN028 @FIN031
  Esquema del escenario: Roles heredados no adquieren análisis ni planificación privada
    Cuando AN un usuario <rol> consulta costos presupuesto alertas y proyección
    Entonces AN las cuatro acciones responden 403 sin campos financieros ni escrituras

    Ejemplos:
      | rol          |
      | ADMIN        |
      | RECEPTIONIST |
      | VIEWER       |

  @FIN023
  Escenario: Una regla no puede usar recursos de otro negocio
    Cuando AN intenta una regla con el recurso ajeno
    Entonces AN recibe 404 sin regla asignación request ni datos ajenos

  @FIN028 @FIN031
  Escenario: Revocar membresía invalida el JWT previo en cada lectura
    Dado AN conserva su JWT y se revoca su membresía OWNER
    Cuando AN consulta alertas y proyección con ese JWT
    Entonces AN ambas acciones responden 403 sin escrituras financieras
