@financeReal @financeRecurrenceBank
Feature: Recurrencias manuales reintegros y conciliación bancaria como evidencia
  Generar un borrador no inventa consumo ni pago. Aprobar exige otro OWNER vigente.
  El extracto y el matching no duplican cobros; una comisión conserva gasto y pago propios.

  Scenario: FIN-019 generación mensual manual e idempotente captura la plantilla original
    Given RB el OWNER dispone de dos negocios sintéticos aislados
    When RB genera dos veces el mismo mes de una plantilla de 100001
    Then RB existe un borrador y ningún gasto ni pago
    When RB cambia la plantilla a 200003 y confirma explícitamente el borrador capturado
    Then RB el costo es 100001 y el borrador conserva su versión de plantilla original

  Scenario: FIN-019 política activada impide autoaprobar y requiere segundo OWNER
    Given RB el OWNER dispone de dos negocios sintéticos aislados
    And RB activa aprobación por otro actor y registra un segundo OWNER
    When RB presenta un borrador de 900000 e intenta autoaprobarlo
    Then RB la autoaprobación responde 403 sin decisión ni gasto
    When RB el segundo OWNER aprueba y el creador confirma el borrador
    Then RB hay una decisión del segundo OWNER y un solo gasto de 900000

  Scenario: FIN-019 reintegrar al empleado no crea un segundo consumo
    Given RB el OWNER dispone de dos negocios sintéticos aislados
    And RB declara banco con apertura de 1000000
    When RB registra un consumo de 900000 ya pagado externamente por la contraparte
    Then RB hay costo 900000 deuda al acreedor 900000 y banco 1000000
    When RB reintegra 900000 a ese acreedor con una intención repetida
    Then RB hay un solo gasto de 900000 deuda 0 y banco 100000

  Scenario: FIN-020 bruto comisión y depósito se concilian sin un segundo movimiento
    Given RB el OWNER dispone de dos negocios sintéticos aislados
    And RB declara banco con apertura de 0
    And RB registra un cobro original de 1000000 y lo asigna al banco
    When RB importa evidencia de depósito por 850000
    Then RB el extracto no cambia caja ni costo y la fila permanece sin conciliar
    When RB confirma matching del bruto con comisión separada de 150000 y repite la intención
    Then RB hay cobro bruto 1000000 costo 150000 pago 150000 y banco 850000
    And RB la fila y los dos componentes suman 850000 sin alterar cobro ni aplicaciones originales

  Scenario: FIN-020 lote de dos cobros admite residuo y deduplica reimportación
    Given RB el OWNER dispone de dos negocios sintéticos aislados
    And RB declara banco con apertura de 0
    And RB registra cobros de 60000 y 40000 y los asigna al banco
    When RB importa evidencia de depósito por 120000
    And RB concilia 100000 con los dos cobros y reimporta el mismo extracto
    Then RB conserva un extracto una fila un matching y banco 100000
    And RB el residuo del extracto es 20000 y los dos cobros tienen residuo 0

  Scenario Outline: FIN-019 y FIN-020 no heredan permisos de otros roles
    Given RB el OWNER dispone de dos negocios sintéticos aislados
    And RB declara banco con apertura de 0
    When RB un usuario <rol> intenta importar extracto crear borrador y leer conciliaciones
    Then RB las tres acciones son denegadas sin datos de CSV ni efectos parciales

    Examples:
      | rol          |
      | ADMIN        |
      | RECEPTIONIST |
      | VIEWER       |

  Scenario: FIN-020 una cuenta ajena recibe el mismo no encontrado que una inexistente
    Given RB el OWNER dispone de dos negocios sintéticos aislados
    And RB declara banco con apertura de 0
    When RB consulta fuentes con una cuenta de otro negocio
    Then RB la cuenta ajena no se revela y no hay conciliación ni mezcla de saldos
