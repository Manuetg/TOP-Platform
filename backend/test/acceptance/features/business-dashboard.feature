Feature: Dashboard público del Business

  Scenario: Dashboard compone las tres métricas aprobadas
    Given Dashboard tiene ocupación, ingresos y reservas para el período
    When consulto el Dashboard de Business A para el período aprobado
    Then Dashboard devuelve las tres métricas completas

  Scenario: Dashboard devuelve métricas completas sin actividad
    Given Dashboard no tiene actividad para el período
    When consulto el Dashboard de Business A para el período aprobado
    Then Dashboard devuelve ocupación nula, ingresos cero y reservas en cero

  Scenario: Dashboard permite lectura histórica del Business archivado
    Given Dashboard no tiene actividad para el período
    And el Business de Dashboard está archivado
    When consulto el Dashboard de Business A para el período aprobado
    Then recibo HTTP 200

  Scenario: Dashboard rechaza un período inválido completo
    When consulto el Dashboard de Business A con un período mayor a 31 días
    Then recibo HTTP 400

  @security
  Scenario: VIEWER puede consultar Dashboard
    Given existe un usuario VIEWER en Business A
    And Dashboard no tiene actividad para el período
    When consulto el Dashboard autorizado de Business A
    Then recibo HTTP 200

  @security
  Scenario: Membership de otro Business no autoriza Dashboard
    Given existe un usuario VIEWER en Business A
    When consulto el Dashboard autorizado de Business B
    Then recibo HTTP 403
