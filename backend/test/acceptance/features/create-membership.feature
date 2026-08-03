Feature: Membresías User-Business

  Scenario: Asociar un usuario a un negocio como OWNER
    Given existe un usuario activo
    And existe un negocio activo
    When asocio el usuario al negocio con rol OWNER
    Then recibo HTTP 201
    And el rol es OWNER

  Scenario: Rechazar membresía duplicada
    Given existe una membresía entre el usuario y el negocio
    When intento crear la misma membresía nuevamente
    Then recibo HTTP 409
    And no se crea una segunda membresía

  Scenario: Rechazar usuario inexistente
    Given existe un negocio activo
    And el usuario no existe
    When intento crear la membresía
    Then recibo HTTP 404

  Scenario: Rechazar negocio inexistente
    Given existe un usuario activo
    And el negocio no existe
    When intento crear la membresía
    Then recibo HTTP 404

  Scenario: Rechazar rol inválido
    Given existe un usuario activo
    And existe un negocio activo
    When intento asociarlo con un rol inválido
    Then recibo HTTP 400
