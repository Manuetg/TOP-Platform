Feature: Estado del backend
  Scenario: Consultar un backend saludable
    Given el backend de TOP está iniciado
    When consulto el endpoint de salud
    Then recibo una respuesta exitosa
    And el estado informado es saludable
