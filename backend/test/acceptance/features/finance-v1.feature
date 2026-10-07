@financeReal
Feature: Finanzas operativas con PostgreSQL y autorización reales
  Un gasto es un costo y una obligación; el pago modifica caja y saldo pendiente.
  Los cobros de huéspedes conservan su fuente y no se duplican como gasto o ingreso.

  Scenario: Reparación consumida y todavía no pagada
    Given FIN el dueño tiene dos negocios sintéticos aislados
    When FIN registra una reparación de 900000 consumida el 30 de septiembre
    Then FIN el costo operativo es 900000 y la obligación es 900000
    And FIN no hay pagos de obligación ni cuenta con saldo conocido

  Scenario: Pago parcial con apertura explícita
    Given FIN el dueño tiene dos negocios sintéticos aislados
    And FIN declara apertura de banco por 1000000
    When FIN registra una reparación de 900000 consumida el 30 de septiembre
    And FIN registra pago externo de 300000 contra la reparación
    Then FIN el costo operativo es 900000 y la obligación es 600000
    And FIN el saldo registrado de banco es 700000
    And FIN el detalle y CSV reproducen el mismo corte económico

  Scenario: Reintento después de respuesta perdida
    Given FIN el dueño tiene dos negocios sintéticos aislados
    When FIN registra la misma reparación dos veces con una llave de intención
    Then FIN existe un solo documento y una sola auditoría de alta
    And FIN cambiar el importe con la misma llave da conflicto

  Scenario Outline: Capabilities nuevas no se heredan de pagos
    Given FIN el dueño tiene dos negocios sintéticos aislados
    When FIN un usuario <rol> intenta leer escribir y exportar Finanzas
    Then FIN las tres acciones son denegadas sin registro financiero

    Examples:
      | rol          |
      | ADMIN        |
      | RECEPTIONIST |
      | VIEWER       |

  Scenario: Contraparte de otro negocio no se revela ni se utiliza
    Given FIN el dueño tiene dos negocios sintéticos aislados
    When FIN intenta registrar reparación con contraparte ajena
    Then FIN recibe el mismo no encontrado que para una contraparte inexistente
    And FIN no hay documentos líneas ni aplicaciones parciales

  Scenario: Arqueo no cambia dinero y su ajuste se registra una vez
    Given FIN el dueño tiene dos negocios sintéticos aislados
    And FIN declara apertura de caja por 1000000
    When FIN cuenta efectivo por 995000
    Then FIN observa diferencia de -5000 y saldo registrado de 1000000
    When FIN registra el ajuste explicado dos veces con una llave
    Then FIN observa diferencia de -5000 y saldo registrado de 995000

  Scenario: Exportar un resultado editado exige volver a consultar
    Given FIN el dueño tiene dos negocios sintéticos aislados
    When FIN registra una reparación de 900000 consumida el 30 de septiembre
    And FIN conserva el corte y después corrige la referencia de evidencia
    Then FIN exportar el corte anterior da conflicto sin archivo
