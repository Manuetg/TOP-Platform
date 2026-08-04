Feature: Consultar recursos

  Scenario: Consultar una cabaña activa
    Given existe un recurso activo
    When consulto el recurso existente
    Then recibo HTTP 200
    And recibo el recurso sin propiedades internas

  Scenario: Rechazar Resource de otro Business
    Given existe un recurso de otro negocio
    When consulto el recurso existente
    Then recibo HTTP 404
