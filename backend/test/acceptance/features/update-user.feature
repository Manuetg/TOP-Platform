@security
Feature: Actualización self-service de User

  Scenario: User ACTIVE actualiza su propio email
    Given existe un User ACTIVE autenticable para actualizar
    When actualiza su propio email
    Then recibo HTTP 200
    And el nuevo email queda normalizado
    And Update User conserva estado y campos protegidos

  Scenario: User no puede actualizar otra identidad global
    Given existe un User ACTIVE autenticable para actualizar
    When intenta actualizar otro User
    Then recibo HTTP 403

  Scenario: User DISABLED no puede actualizarse
    Given existe un User DISABLED para actualizar
    When intenta actualizarse con su access token
    Then recibo HTTP 401

  Scenario: Cambiar email conserva la sesión vigente
    Given existe un User ACTIVE autenticable para actualizar
    And inició sesión antes de cambiar email
    When actualiza su propio email conservando la sesión
    Then puede renovar la sesión previa
