Feature: Plan de pagos

  Scenario: Crear un plan sin Payments conserva Booking y PricingSnapshot
    Given existe un Booking CONFIRMED con total 100
    When se crea un Payment Plan con cuotas "40,60"
    Then el Payment Plan tiene montos "40,60" y aplicados "0,0"
    And el Booking del plan permanece CONFIRMED
    And el PricingSnapshot del plan permanece sin cambios

  Scenario: Crear el plan después de un adelanto existente
    Given existe un Booking CONFIRMED con total 100 y un Payment registrado de 40
    When se crea un Payment Plan con cuotas "40,60"
    Then el Payment Plan tiene montos "40,60" y aplicados "40,0"
    And existe 1 PaymentApplication

  Scenario: Un Payment cubre varias cuotas
    Given existe un Booking CONFIRMED con total 100
    And existe un Payment Plan con cuotas "40,60"
    When se registra para el plan un Payment de 70 con clave "across"
    Then el Payment Plan tiene montos "40,60" y aplicados "40,30"

  Scenario: Varios Payments cubren parcialmente una cuota
    Given existe un Booking CONFIRMED con total 100
    And existe un Payment Plan con cuotas "100"
    When se registran Payments de 30 y 20 para el plan
    Then el Payment Plan tiene montos "100" y aplicados "50"
    And existen 2 PaymentApplications

  Scenario: El plan queda bloqueado después de la primera aplicación
    Given existe un Booking CONFIRMED con total 100
    And existe un Payment Plan con cuotas "40,60"
    And se registra para el plan un Payment de 10 con clave "locked"
    When se intenta reemplazar el Payment Plan con cuotas "50,50"
    Then la operación de Payment Plan es rechazada con 409

  @security
  Scenario: VIEWER no puede crear un plan
    Given existe un usuario VIEWER en Business A
    And existe un Booking CONFIRMED con total 100
    When se intenta crear un Payment Plan con cuotas "40,60"
    Then la operación de Payment Plan es rechazada con 403
