Feature: KPI interno de cobros registrados

  Scenario: Negocio sin cobros en el período
    Given Revenue no tiene cobros registrados para el negocio
    When calculo el KPI interno de Revenue para el período aprobado
    Then Revenue devuelve 0 PYG

  Scenario: Un cobro registrado
    Given Revenue tiene 250000 PYG registrados para el negocio
    When calculo el KPI interno de Revenue para el período aprobado
    Then Revenue devuelve 250000 PYG

  Scenario: Múltiples cobros se agregan en Payment
    Given Revenue tiene 700000 PYG registrados para el negocio
    When calculo el KPI interno de Revenue para el período aprobado
    Then Revenue devuelve 700000 PYG

  Scenario: Cobros fuera del período no forman parte de la proyección
    Given Revenue tiene 0 PYG registrados para el negocio
    When calculo el KPI interno de Revenue para el período aprobado
    Then Revenue devuelve 0 PYG

  Scenario: Booking cancelada conserva su Payment registrado
    Given Revenue tiene 300000 PYG registrados para el negocio
    When calculo el KPI interno de Revenue para el período aprobado
    Then Revenue devuelve 300000 PYG

  Scenario: Business archivado permite lectura histórica
    Given el negocio de Revenue está archivado
    And Revenue tiene 450000 PYG registrados para el negocio
    When calculo el KPI interno de Revenue para el período aprobado
    Then Revenue devuelve 450000 PYG

  Scenario: Los agregados permanecen aislados por Business
    Given Revenue tiene 100000 PYG registrados para el negocio
    And otro negocio tiene 900000 PYG registrados en Revenue
    When calculo el KPI interno de Revenue para el período aprobado
    Then Revenue devuelve 100000 PYG

  Scenario: Moneda persistida inconsistente
    Given Revenue tiene 100 PYG y 2 USD en el mismo negocio
    When calculo el KPI interno de Revenue para el período aprobado
    Then Revenue reporta una invariante financiera interna
