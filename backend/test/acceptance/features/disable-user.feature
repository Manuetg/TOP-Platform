Feature: Deshabilitación de usuarios

  Scenario: Deshabilitar un usuario activo
    Given existe un usuario activo para deshabilitar
    When deshabilito el usuario
    Then recibo HTTP 200
    And el usuario queda DISABLED

  Scenario: Repetir la deshabilitación
    Given existe un usuario deshabilitado para deshabilitar
    When deshabilito nuevamente el usuario
    Then recibo HTTP 200
    And el usuario continúa DISABLED

  Scenario: Rechazar usuario inexistente
    Given el usuario para deshabilitar no existe
    When intento deshabilitarlo
    Then recibo HTTP 404

  Scenario: Rechazar identificador inválido
    When intento deshabilitar un usuario con UUID inválido
    Then recibo HTTP 400

  Scenario: Login rechazado después de deshabilitar
    Given existe un usuario activo para deshabilitar
    And el usuario fue deshabilitado
    When intento iniciar sesión con el usuario deshabilitado
    Then recibo HTTP 403

  Scenario: Refresh rechazado después de deshabilitar
    Given existe un usuario activo con una sesión de refresh válida para deshabilitar
    And el usuario fue deshabilitado
    When intento renovar la sesión del usuario deshabilitado
    Then recibo HTTP 403
