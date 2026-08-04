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

  Scenario: Listar Resources de un negocio
    Given existen Resources de todos los estados para listado
    When consulto la lista de Resources
    Then recibo HTTP 200
    And recibo Resources ordenados sin propiedades internas

  Scenario: Listar Resources vacío
    Given no existen Resources para listado
    When consulto la lista de Resources
    Then recibo HTTP 200
    And recibo una lista vacía de Resources
