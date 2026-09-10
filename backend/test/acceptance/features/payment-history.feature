Feature: Historial de Payments de una reserva

  Scenario: Booking sin pagos
    Given existe un Booking CONFIRMED con total 100
    When consulto el historial de Payments
    Then el historial contiene 0 Payments
    And el historial no tiene página siguiente

  Scenario: Booking con un Payment
    Given existe un Booking CONFIRMED con total 100 y un Payment registrado de 40
    When consulto el historial de Payments
    Then el historial contiene 1 Payments
    And el historial expone únicamente el contrato público

  Scenario: Booking con varios Payments ordenados
    Given existe un Booking CONFIRMED con total 100
    And existen Payments históricos con importes "10,20,30"
    When consulto el historial de Payments
    Then el historial informa importes "30,20,10"

  Scenario: Historial paginado
    Given existe un Booking CONFIRMED con total 100
    And existen Payments históricos con importes "10,20,30"
    When consulto el historial de Payments con límite 2
    Then el historial contiene 2 Payments
    And el historial tiene página siguiente
    When consulto la siguiente página del historial con límite 2
    Then el historial informa importes "10"
    And el historial no tiene página siguiente

  Scenario: Payments con la misma fecha financiera mantienen orden estable
    Given existe un Booking CONFIRMED con total 100
    And existen Payments con el mismo paidAt y distintos createdAt
    When consulto el historial de Payments
    Then el historial informa importes "30,20,10"

  Scenario: Payment registrado después conserva paidAt histórico
    Given existe un Booking CONFIRMED con total 100
    And existe un Payment registrado posteriormente con paidAt histórico
    When consulto el historial de Payments
    Then el historial conserva paidAt "2020-01-01T10:00:00.000Z"

  @security
  Scenario: VIEWER consulta el historial
    Given existe un usuario VIEWER en Business A
    And existe un Booking CONFIRMED con total 100
    When consulto el historial de Payments
    Then el historial contiene 0 Payments

  Scenario: Business archivado conserva lectura histórica
    Given existe un Booking CONFIRMED con total 100 y un Payment registrado de 40
    And el Business del historial está archivado
    When consulto el historial de Payments
    Then el historial contiene 1 Payments

  Scenario Outline: Booking histórica conserva sus Payments
    Given existe un Booking CONFIRMED con total 100 y un Payment registrado de 40
    And el Booking financiero queda en estado "<status>"
    When consulto el historial de Payments
    Then el historial contiene 1 Payments

    Examples:
      | status    |
      | COMPLETED |
      | CANCELLED |
      | NO_SHOW   |

  Scenario: Cross-tenant no revela Payments
    Given existe un Booking CONFIRMED de otro negocio con total 100
    When consulto el historial de Payments
    Then la consulta del historial responde 404
