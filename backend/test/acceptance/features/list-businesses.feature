Feature: Lista de negocios
  Scenario: Consultar negocios existentes ordenados por fecha de creación
    Given el backend de TOP está iniciado
    And existen negocios registrados
    When consulto la lista de negocios
    Then recibo la lista ordenada de negocios
