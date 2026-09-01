@security
Feature: Roles por Business

  Scenario: User has different roles in different Businesses
    Given existe un usuario habilitado con varias membresías
    When inicio sesión con sus credenciales válidas
    Then recibo HTTP 200
    And recibo las membresías disponibles

  Scenario: Administrative role in one Business does not authorize another Business
    Given existe un usuario OWNER en Business A y VIEWER en Business B
    When intenta actualizar administrativamente Business B
    Then recibo HTTP 403

  Scenario: Viewer can read resources allowed by its membership
    Given existe un usuario OWNER en Business A y VIEWER en Business B
    When consulta Business B
    Then recibo HTTP 200

  Scenario: Viewer cannot execute a prohibited mutation
    Given existe un usuario OWNER en Business A y VIEWER en Business B
    When intenta modificar Business B
    Then recibo HTTP 403

  Scenario: Receptionist cannot execute an administrative operation
    Given existe un usuario RECEPTIONIST en Business A
    When intenta administrar memberships de Business A
    Then recibo HTTP 403

  Scenario: Owner can execute an administrative operation in its Business
    Given existe un usuario OWNER en Business A
    When modifica Business A
    Then recibo HTTP 200
