Feature: Calendario de disponibilidad
  Scenario: calendar displays an available active resource
    Given existe un Resource activo para el calendario
    When consulto el calendario de disponibilidad
    Then recibo una celda AVAILABLE del calendario

  Scenario: calendar displays booking and block conflicts per day
    Given existe un Resource activo para el calendario
    And existe un Booking confirmado que bloquea el Resource
    And existe un Block que bloquea el Resource
    When consulto el calendario de disponibilidad
    Then recibo ambas razones de conflicto en el calendario

  Scenario: calendar includes out-of-service resources
    Given existe un Resource fuera de servicio para Availability
    When consulto el calendario de disponibilidad
    Then recibo razón RESOURCE_OUT_OF_SERVICE en el calendario

  Scenario: calendar rejects a range longer than 31 days
    Given existe un Resource activo para el calendario
    When consulto un rango de calendario mayor a 31 días
    Then recibo HTTP 400

  Scenario: calendar hides a cross-tenant resource
    Given existe un Resource de Availability en otro negocio
    When consulto ese Resource en el calendario desde mi negocio
    Then recibo HTTP 404
