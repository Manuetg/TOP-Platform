Feature: Amenities de Resource

  Scenario: Un Resource sin amenities devuelve una colección vacía
    Given existe un recurso activo
    When consulto el recurso existente
    Then recibo HTTP 200
    And recibo el recurso sin propiedades internas
