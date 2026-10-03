@security
Feature: Suspensión segura del cambio de correo de User

  Scenario: User ACTIVE conserva el correo actual ante un cambio suspendido
    Given existe un User ACTIVE autenticable para actualizar
    When intenta cambiar su propio correo
    Then recibo HTTP 409
    And el cambio de correo queda suspendido y conserva la identidad
    And Update User conserva estado y campos protegidos

  Scenario: User no puede actualizar otra identidad global
    Given existe un User ACTIVE autenticable para actualizar
    When intenta actualizar otro User
    Then recibo HTTP 403

  Scenario: User DISABLED no puede actualizarse
    Given existe un User DISABLED para actualizar
    When intenta actualizarse con su access token
    Then recibo HTTP 401

  Scenario: Cambio rechazado y no-op normalizado conservan la sesión vigente
    Given existe un User ACTIVE autenticable para actualizar
    And inició sesión antes de intentar cambiar correo
    When intenta cambiar su correo conservando la sesión
    Then recibo HTTP 409
    When solicita el mismo correo con espacios y mayúsculas
    Then recibo HTTP 200
    And el mismo correo queda normalizado
    And puede renovar la sesión previa
