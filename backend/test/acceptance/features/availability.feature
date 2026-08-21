Feature: Disponibilidad de Resource
  Scenario: active resource is available
    Given existe un Resource activo para Availability
    When consulto su disponibilidad
    Then recibo disponibilidad AVAILABLE

  Scenario: blocking booking makes resource unavailable
    Given existe un Resource activo para Availability
    And existe un Booking confirmado que bloquea el Resource
    When consulto su disponibilidad
    Then recibo razón BOOKING_CONFLICT

  Scenario: blocking block makes resource unavailable
    Given existe un Resource activo para Availability
    And existe un Block que bloquea el Resource
    When consulto su disponibilidad
    Then recibo razón BLOCK_CONFLICT

  Scenario: booking and block expose both reasons
    Given existe un Resource activo para Availability
    And existe un Booking confirmado que bloquea el Resource
    And existe un Block que bloquea el Resource
    When consulto su disponibilidad
    Then recibo ambas razones de conflicto

  Scenario: out-of-service resource is unavailable
    Given existe un Resource fuera de servicio para Availability
    When consulto su disponibilidad
    Then recibo razón RESOURCE_OUT_OF_SERVICE

  Scenario: archived resource is unavailable
    Given existe un Resource archivado para Availability
    When consulto su disponibilidad
    Then recibo razón RESOURCE_ARCHIVED

  Scenario: invalid availability range is rejected
    Given existe un Resource activo para Availability
    When consulto un rango de disponibilidad inválido
    Then recibo HTTP 400

  Scenario: cross-tenant resource is hidden
    Given existe un Resource de Availability en otro negocio
    When consulto su disponibilidad desde mi negocio
    Then recibo HTTP 404
