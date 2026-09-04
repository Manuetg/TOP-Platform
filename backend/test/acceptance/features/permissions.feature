@security
Feature: Permisos estáticos por capability

  Scenario: Receptionist operates bookings but cannot configure resources
    Given existe un usuario RECEPTIONIST en Business A
    When crea una Booking operativa en Business A
    Then recibo HTTP 201
    When intenta crear un Resource en Business A
    Then recibo HTTP 403

  Scenario: Receptionist can create blocks but cannot change availability rules
    Given existe un usuario RECEPTIONIST en Business A
    And existe un Resource activo para permisos
    When crea un Block operativo en Business A
    Then recibo HTTP 201
    When intenta cambiar reglas de Availability en Business A
    Then recibo HTTP 403

  Scenario: Receptionist can calculate price but cannot change pricing
    Given existe un usuario RECEPTIONIST en Business A
    And existe una tarifa calculable para permisos
    When calcula el precio estándar en Business A
    Then recibo HTTP 200
    When intenta cambiar Pricing en Business A
    Then recibo HTTP 403

  Scenario: Admin cannot assign ownership
    Given existe un usuario ADMIN en Business A
    And existe un usuario objetivo para permisos
    When intenta asignar OWNER en Business A
    Then recibo HTTP 403

  Scenario: Admin cannot archive the business
    Given existe un usuario ADMIN en Business A
    When intenta archivar Business A
    Then recibo HTTP 403

  Scenario: Viewer can read but cannot mutate business data
    Given existe un usuario VIEWER en Business A
    When consulta Business A para permisos
    Then recibo HTTP 200
    When intenta modificar Business A para permisos
    Then recibo HTTP 403

  Scenario: Role in one business does not authorize another business
    Given existe un usuario OWNER en Business A y VIEWER en Business B
    When intenta modificar Business B
    Then recibo HTTP 403

  Scenario: Tenant role does not grant platform-wide user administration
    Given existe un usuario OWNER en Business A
    When intenta crear un User global
    Then recibo HTTP 403
    When intenta deshabilitar otro User global
    Then recibo HTTP 403
