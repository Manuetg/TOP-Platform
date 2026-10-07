@financeReal @financeRecognitionClose
Feature: Servicio efectivamente prestado y cierre mensual financiero
  El OWNER declara prestación con evidencia manual y precio SERVICE fijo.
  El cierre conserva un paquete inmutable y protege los hechos del mes terminado.

  Background:
    Given REC existen dos negocios sintéticos con OWNER y membresías reales
    And REC existe una estancia del 29 de septiembre al 3 de octubre por 1200000 con ingreso y salida manuales

  Scenario: Golden A reconoce las cuatro noches en sus fechas reales
    When REC el OWNER certifica explícitamente las cuatro noches de 300000
    Then REC septiembre reconoce 600000 y octubre reconoce 600000
    And REC repetir la certificación con su clave conserva un certificado y cuatro unidades

  Scenario: Selección dispersa conserva hueco de cobertura sin fabricar servicio
    When REC el OWNER certifica sólo la noche del 29 de septiembre
    Then REC septiembre reconoce 300000 y tiene una noche pendiente sin margen calculado
    And REC existen exactamente una unidad de servicio y el precio exigible original

  Scenario Outline: Nuevas capacidades financieras requieren OWNER vigente
    When REC un usuario <rol> intenta consultar fuentes y certificar prestación
    Then REC las dos acciones responden 403 sin certificado ni request financiero

    Examples:
      | rol          |
      | ADMIN        |
      | RECEPTIONIST |
      | VIEWER       |

  Scenario: Cierre bloquea consumo retroactivo y reapertura conserva el paquete histórico
    Given REC el OWNER certifica explícitamente las cuatro noches de 300000
    When REC el OWNER cierra septiembre con checklist y token del servidor
    Then REC el registry PostgreSQL acredita todos los writers financieros requeridos
    And REC un gasto consumido en septiembre responde 409 sin filas parciales
    When REC el OWNER reabre septiembre con versión y motivo
    Then REC el snapshot y CSV anteriores conservan exactamente su hash y contenido
    And REC el gasto septiembre ya puede registrarse en el período reabierto
