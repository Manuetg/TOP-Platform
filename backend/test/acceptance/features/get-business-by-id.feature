Feature: Consulta de negocio
  Scenario: Consultar un negocio existente por identificador
    Given el backend de TOP está iniciado
    When consulto el negocio con identificador "f8c49800-e50e-4d0e-b82b-0b51c09a0001"
    Then recibo los datos públicos del negocio
