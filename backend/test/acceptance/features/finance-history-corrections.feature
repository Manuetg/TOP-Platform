@financeReal @financeHistoryCorrections
Feature: Historia financiera y devoluciones conservando las fuentes originales
  La importación es acotada y explícita. Una corrección no borra el cobro original.
  Una devolución registra dinero ya devuelto fuera de TOP y no calcula penalidades.

  Scenario: FIN-016 CSV inválido informa cada fila sin crear hechos financieros
    Given HIS el OWNER dispone de dos negocios sintéticos aislados
    And HIS existe un cobro original de 100000 y una cuenta sin apertura
    When HIS previsualiza una apertura fraccionaria y una fila de tipo inválido
    Then HIS recibe errores de filas 2 y 3 sin token de confirmación
    And HIS no hay lote gasto apertura ni liquidación importados y el legado permanece íntegro

  Scenario: FIN-016 apertura e historial con pago anterior incluido sin duplicar caja
    Given HIS el OWNER dispone de dos negocios sintéticos aislados
    And HIS existe un cobro original de 100000 y una cuenta sin apertura
    When HIS previsualiza apertura de 1000000 gasto de 900000 y pago previo de 300000 incluido en apertura
    Then HIS la vista previa no escribe y declara gasto 900000 pago 300000 y exclusión 300000
    When HIS confirma el lote y repite la misma intención y el mismo archivo
    Then HIS conserva un gasto de 900000 deuda 600000 y banco 1000000
    And HIS los hechos originales de reserva precio cobro y aplicaciones permanecen íntegros

  Scenario: FIN-017 anular un cobro erróneo conserva original y revierte aplicaciones por separado
    Given HIS el OWNER dispone de dos negocios sintéticos aislados
    And HIS el precio es 100000 y registra un cobro de 100000 por HTTP
    When HIS anula ese registro con una intención repetida
    Then HIS el bruto es 100000 el anulado 100000 el neto 0 y la deuda 100000
    And HIS hay un reverso de aplicación de 100000 y los hechos originales permanecen íntegros

  Scenario: FIN-018 rebaja y devolución resuelven crédito sin gasto operativo
    Given HIS el OWNER dispone de dos negocios sintéticos aislados
    And HIS el precio es 1000000 y registra un cobro de 1000000 por HTTP
    And HIS asigna el cobro a banco con apertura 0
    When HIS acepta por HTTP una revisión del precio a 800000
    Then HIS el crédito actual es 200000 y el cobro original continúa intacto
    When HIS registra devolución externa de 200000 con una intención repetida
    Then HIS el neto retenido es 800000 el crédito es 0 la deuda es 0 y banco es 800000
    And HIS existe una devolución sin gasto transferencia ni nuevo cobro

  Scenario: FIN-018 devolver sin reducir el exigible puede recrear deuda
    Given HIS el OWNER dispone de dos negocios sintéticos aislados
    And HIS el precio es 1000000 y registra un cobro de 1000000 por HTTP
    And HIS asigna el cobro a banco con apertura 0
    When HIS registra devolución externa de 200000 con una intención repetida
    Then HIS el neto retenido es 800000 el crédito es 0 la deuda es 200000 y banco es 800000
    And HIS existe una devolución sin gasto transferencia ni nuevo cobro

  Scenario: FIN-018 cancelación exige importe final manual y devolución ligada al original
    Given HIS el OWNER dispone de dos negocios sintéticos aislados
    And HIS el precio es 1000000 y registra un cobro de 400000 por HTTP
    And HIS asigna el cobro a banco con apertura 0
    When HIS cancela la reserva por HTTP
    Then HIS cancelar conserva exigible 1000000 deuda 600000 y no crea devolución ni penalidad
    When HIS confirma manualmente importe final de 100000
    And HIS registra devolución externa de 300000 con una intención repetida
    Then HIS el neto retenido es 100000 el crédito es 0 la deuda es 0 y banco es 100000
    And HIS existe una devolución sin gasto transferencia ni nuevo cobro
