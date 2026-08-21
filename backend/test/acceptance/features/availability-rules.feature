Feature: Reglas de disponibilidad
  Scenario: business uses compatible availability rule defaults
    When consulto las reglas de disponibilidad
    Then recibo los defaults de reglas de disponibilidad

  Scenario: business updates its availability rules
    When actualizo las reglas de disponibilidad para que PENDING no bloquee y con buffer previo de 1 día
    Then recibo las reglas de disponibilidad actualizadas
