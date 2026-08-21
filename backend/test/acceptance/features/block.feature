Feature: Gestionar Blocks

  Scenario: Crear, listar y cancelar un Block
    Given existe un Resource activo para Block
    When creo un Block programado
    Then recibo HTTP 201
    When listo los Blocks del negocio
    Then recibo HTTP 200
    And recibo un Block público programado
    When cancelo el Block creado
    Then recibo HTTP 200
    And recibo un Block público cancelado

  Scenario: No se exponen Blocks de otro negocio
    Given existe un Block en otro negocio
    When intento cancelar el Block de otro negocio
    Then recibo HTTP 404
