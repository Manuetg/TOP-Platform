Feature: Saldo pendiente de una reserva

  Scenario: Reserva confirmada sin pagos ni plan
    Given existe un Booking CONFIRMED con total 100
    When consulto el Outstanding Balance de la reserva
    Then el saldo informa total 100, pagado 0, pendiente 100 y estado "UNPAID"
    And el saldo no inventa vencimientos

  Scenario: Pago parcial sin Payment Plan
    Given existe un Booking CONFIRMED con total 100 y un Payment registrado de 40
    When consulto el Outstanding Balance de la reserva
    Then el saldo informa total 100, pagado 40, pendiente 60 y estado "PARTIALLY_PAID"
    And el saldo no inventa vencimientos

  Scenario: Reserva completamente pagada
    Given existe un Booking CONFIRMED con total 100 y un Payment registrado de 100
    When consulto el Outstanding Balance de la reserva
    Then el saldo informa total 100, pagado 100, pendiente 0 y estado "PAID"

  Scenario: Cuota vencida con aplicación parcial
    Given existe un Booking CONFIRMED con total 100
    And el Booking tiene un Payment Plan con cuotas "40,60" en fechas "2020-01-01,2099-01-01"
    When la recepción registra un Payment de 20 con clave "overdue-partial"
    And consulto el Outstanding Balance de la reserva
    Then el saldo informa total 100, pagado 20, pendiente 80 y estado "OVERDUE"
    And el saldo informa vencido 20 y próximo vencimiento "2020-01-01" por 20

  Scenario: El próximo vencimiento informa el remanente aplicado
    Given existe un Booking CONFIRMED con total 100
    And el Booking tiene un Payment Plan con cuotas "40,60" en fechas "2099-01-01,2099-02-01"
    When la recepción registra un Payment de 10 con clave "next-partial"
    And consulto el Outstanding Balance de la reserva
    Then el saldo informa total 100, pagado 10, pendiente 90 y estado "PARTIALLY_PAID"
    And el saldo informa vencido 0 y próximo vencimiento "2099-01-01" por 30

  Scenario Outline: Lectura financiera histórica
    Given existe un Booking CONFIRMED con total 100 y un Payment registrado de 40
    And el Booking financiero queda en estado "<status>"
    When consulto el Outstanding Balance de la reserva
    Then el saldo informa total 100, pagado 40, pendiente 60 y estado "PARTIALLY_PAID"

    Examples:
      | status    |
      | COMPLETED |
      | CANCELLED |
      | NO_SHOW   |

  Scenario: Cross-tenant no revela la reserva
    Given existe un Booking CONFIRMED con total 100
    When consulto el Outstanding Balance de la reserva desde otro negocio
    Then la consulta de Outstanding Balance responde 404

  @security
  Scenario: VIEWER consulta el saldo
    Given existe un usuario VIEWER en Business A
    And existe un Booking CONFIRMED con total 100
    When consulto el Outstanding Balance de la reserva
    Then el saldo informa total 100, pagado 0, pendiente 100 y estado "UNPAID"
