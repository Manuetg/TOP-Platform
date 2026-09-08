Feature: Registrar Payment

  Scenario: Registrar un pago parcial conserva Booking y PricingSnapshot
    Given existe un Booking CONFIRMED con total 100
    When la recepción registra un Payment de 40 con clave "partial"
    Then el Payment de 40 queda registrado
    And el Booking permanece CONFIRMED
    And el PricingSnapshot permanece sin cambios

  Scenario: Registrar el importe total exacto
    Given existe un Booking CONFIRMED con total 100
    When la recepción registra un Payment de 100 con clave "exact"
    Then el Payment de 100 queda registrado

  Scenario: Rechazar sobrepago
    Given existe un Booking CONFIRMED con total 100 y un Payment registrado de 60
    When la recepción registra un Payment de 50 con clave "over"
    Then el registro de Payment es rechazado con 409

  Scenario: Reintento idempotente no duplica pagos
    Given existe un Booking CONFIRMED con total 100
    When la recepción repite el Payment de 40 con clave "retry"
    Then existe un único Payment registrado

  Scenario: Un Booking de otro negocio no expone información
    Given existe un Booking CONFIRMED de otro negocio con total 100
    When la recepción intenta registrar un Payment de 40 desde el negocio actual
    Then el registro de Payment es rechazado con 404
