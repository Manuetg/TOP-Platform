Feature: KPI interno de reservas creadas

  Scenario: Período sin reservas
    Given Reservations no tiene Bookings creadas para el negocio
    When calculo el KPI interno de Reservations para el período aprobado
    Then Reservations devuelve total 0 y todos los estados en cero

  Scenario: Distribución mixta por los siete estados actuales
    Given Reservations tiene 1 DRAFT, 2 PENDING, 3 CONFIRMED, 4 IN_PROGRESS, 5 COMPLETED, 6 CANCELLED y 7 NO_SHOW
    When calculo el KPI interno de Reservations para el período aprobado
    Then Reservations devuelve total 28 y la distribución aprobada

  Scenario: Estados ausentes permanecen explícitos en cero
    Given Reservations tiene 2 CANCELLED para el negocio
    When calculo el KPI interno de Reservations para el período aprobado
    Then Reservations devuelve 2 CANCELLED y los demás estados en cero

  Scenario: Una cancelación posterior usa el estado actual
    Given una Booking creada en el período ahora está CANCELLED
    When calculo el KPI interno de Reservations para el período aprobado
    Then Reservations devuelve 1 CANCELLED y 0 DRAFT

  Scenario: Una Booking multi-resource cuenta una sola reserva
    Given una Booking creada en el período tiene múltiples Resources
    When calculo el KPI interno de Reservations para el período aprobado
    Then Reservations devuelve total 1

  Scenario: La estadía futura no define la cohorte
    Given una Booking creada en el período tiene estadía futura
    When calculo el KPI interno de Reservations para el período aprobado
    Then Reservations devuelve total 1

  Scenario: Business archivado permite lectura histórica
    Given el negocio de Reservations está archivado
    And Reservations tiene 1 COMPLETED para el negocio
    When calculo el KPI interno de Reservations para el período aprobado
    Then Reservations devuelve total 1

  Scenario: El período usa la timezone del Business
    Given Reservations tiene 1 CONFIRMED para el negocio
    When calculo el KPI interno de Reservations para el período aprobado
    Then Reservations consulta con la timezone America/Asuncion

  Scenario: Los agregados permanecen aislados por Business
    Given Reservations tiene 1 PENDING para el negocio
    And otro negocio tiene 9 CONFIRMED en Reservations
    When calculo el KPI interno de Reservations para el período aprobado
    Then Reservations devuelve total 1

  Scenario: Estado desconocido no se ignora
    Given Reservations contiene un estado persistido desconocido
    When calculo el KPI interno de Reservations para el período aprobado
    Then Reservations reporta una invariante interna
