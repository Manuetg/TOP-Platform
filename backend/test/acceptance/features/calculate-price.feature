Feature: Calcular precio de estadía
  Scenario: Cotizar una estadía con tarifa base
    Given una tarifa tiene Resource uno y Resource dos
    When cotizo cuatro noches para Resource uno
    Then recibo HTTP 200
    And recibo cuatro noches con tarifa base

  Scenario: Rechazar una tarifa no asignada al Resource
    Given una tarifa tiene Resource uno y Resource dos
    When cotizo para Resource tres no asignado
    Then recibo HTTP 409
