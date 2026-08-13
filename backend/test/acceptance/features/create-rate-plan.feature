Feature: Crear plan de tarifas

  Scenario: Crear una tarifa base sin Resources
    Given existe un negocio activo
    When creo una tarifa base sin Resources
    Then recibo HTTP 201
    And recibo la tarifa pública en PYG
