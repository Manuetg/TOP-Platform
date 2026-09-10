Feature: KPI interno de ocupación

  Scenario: Negocio sin inventario operacional
    Given la ocupación interna tiene 0 noches ocupadas y 0 noches vendibles
    When calculo el KPI interno de Occupancy para el período aprobado
    Then Occupancy devuelve denominador cero y rate nulo

  Scenario: Inventario disponible sin reservas
    Given la ocupación interna tiene 0 noches ocupadas y 3 noches vendibles
    When calculo el KPI interno de Occupancy para el período aprobado
    Then Occupancy devuelve 0 ocupadas, 3 vendibles y 0 basis points

  Scenario: Ocupación parcial
    Given la ocupación interna tiene 1 noches ocupadas y 2 noches vendibles
    When calculo el KPI interno de Occupancy para el período aprobado
    Then Occupancy devuelve 1 ocupadas, 2 vendibles y 5000 basis points

  Scenario: Ocupación completa con múltiples Resources
    Given la ocupación interna tiene 6 noches ocupadas y 6 noches vendibles
    When calculo el KPI interno de Occupancy para el período aprobado
    Then Occupancy devuelve 6 ocupadas, 6 vendibles y 10000 basis points

  Scenario: Block reduce el inventario vendible sin crear ocupación
    Given la ocupación interna tiene 0 noches ocupadas y 2 noches vendibles
    When calculo el KPI interno de Occupancy para el período aprobado
    Then Occupancy devuelve 0 ocupadas, 2 vendibles y 0 basis points

  Scenario: Resource no operacional queda fuera del inventario actual
    Given la ocupación interna tiene 0 noches ocupadas y 0 noches vendibles
    When calculo el KPI interno de Occupancy para el período aprobado
    Then Occupancy devuelve denominador cero y rate nulo

  Scenario: Resource creada durante el período aporta solo noches posteriores
    Given la ocupación interna tiene 0 noches ocupadas y 2 noches vendibles
    When calculo el KPI interno de Occupancy para el período aprobado
    Then Occupancy devuelve 0 ocupadas, 2 vendibles y 0 basis points

  Scenario: Consulta histórica usa el inventario operacional actual
    Given la ocupación interna tiene 2 noches ocupadas y 3 noches vendibles
    When calculo el KPI interno de Occupancy para el período aprobado
    Then Occupancy devuelve 2 ocupadas, 3 vendibles y 6667 basis points

  Scenario: Datos imposibles no se reducen mediante clamp
    Given la ocupación interna tiene 2 noches ocupadas y 1 noches vendibles
    When calculo el KPI interno de Occupancy para el período aprobado
    Then Occupancy reporta una invariante interna inconsistente
