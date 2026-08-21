Feature: Borradores de reservas
  Scenario: Crear un Draft mínimo
    When creo un Draft mínimo
    Then recibo HTTP 201
    And el Booking queda en DRAFT

  Scenario: Actualizar parcialmente un Draft
    Given existe un Draft de Booking
    When actualizo las notas del Draft
    Then recibo HTTP 200
    And el Booking público contiene las notas actualizadas

  Scenario: Un Booking de otro negocio no se expone
    Given existe un Draft de Booking en otro negocio
    When consulto ese Booking desde mi negocio
    Then recibo HTTP 404
