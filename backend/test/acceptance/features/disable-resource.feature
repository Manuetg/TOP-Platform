Feature: Deshabilitar recursos

  Scenario: Deshabilitar un recurso activo de forma idempotente
    Given existe un recurso activo para deshabilitar
    When deshabilito el recurso
    Then recibo HTTP 200
    And el recurso queda fuera de servicio sin propiedades internas
    When deshabilito el recurso nuevamente
    Then recibo HTTP 200
    And el recurso queda fuera de servicio sin propiedades internas

  Scenario: Rechazar deshabilitar un recurso archivado
    Given existe un recurso archivado para deshabilitar
    When deshabilito el recurso
    Then recibo HTTP 409

  Scenario: Rechazar deshabilitar recurso de otro negocio
    Given existe un recurso de otro negocio para deshabilitar
    When deshabilito el recurso
    Then recibo HTTP 404
