@postgres
Feature: Confirmación con precio manual sin referencia
  Scenario: Confirmar una reserva aunque exista un tarifario aplicable
    Given existe una reserva pendiente con una tarifa aplicable
    When consulto los tarifarios de esa estadía
    Then el catálogo incluye la tarifa aplicable
    When confirmo la reserva con precio manual sin referencia
    Then recibo HTTP 200
    And Booking, Snapshot y Timeline conservan el total manual sin plan
