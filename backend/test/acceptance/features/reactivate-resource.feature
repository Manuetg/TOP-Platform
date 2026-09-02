Feature: Reactivar recursos

  Scenario: Reactivar un recurso fuera de servicio de forma idempotente
    Given existe un recurso fuera de servicio para reactivar
    When reactivo el recurso
    Then recibo HTTP 200
    And el recurso queda activo sin propiedades internas
    When reactivo el recurso nuevamente
    Then recibo HTTP 200
    And el recurso queda activo sin propiedades internas

  Scenario: Rechazar reactivar un recurso archivado o de otro negocio
    Given existe un recurso archivado para reactivar
    When reactivo el recurso
    Then recibo HTTP 409
    Given existe un recurso de otro negocio para reactivar
    When reactivo el recurso
    Then recibo HTTP 404
