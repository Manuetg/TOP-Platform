Feature: Gestionar planes de tarifas

  Scenario: Crear una tarifa base sin Resources
    Given existe un negocio activo
    When creo una tarifa base sin Resources
    Then recibo HTTP 201
    And recibo la tarifa pública en PYG

  Scenario: Actualizar una tarifa base
    Given existe una tarifa base activa
    When actualizo el importe de la tarifa
    Then recibo HTTP 200
    And la tarifa mantiene los campos omitidos

  Scenario: Limpiar la descripción y la vigencia de una tarifa
    Given existe una tarifa base activa
    When limpio la descripción y la vigencia de la tarifa
    Then recibo HTTP 200
    And la descripción y la vigencia quedan vacías

  Scenario: Reemplazar Resources con una lista vacía
    Given existe una tarifa base activa
    When reemplazo sus Resources por una lista vacía
    Then recibo HTTP 200
    And la tarifa conserva una lista de Resources vacía

  Scenario: Ocultar una tarifa de otro negocio
    Given existe una tarifa base activa
    When actualizo la tarifa desde otro negocio
    Then recibo HTTP 404

  Scenario: Bloquear una tarifa archivada
    Given existe una tarifa archivada
    When actualizo el importe de la tarifa
    Then recibo HTTP 409

  Scenario: Reemplazar Resources sin acumular relaciones anteriores
    Given una tarifa tiene Resource uno y Resource dos
    When reemplazo sus Resources por Resource dos y Resource tres
    Then recibo HTTP 200
    And la tarifa queda solo con Resource dos y Resource tres

  Scenario: Asignar un Resource fuera de servicio
    Given existe una tarifa base activa
    And un Resource está fuera de servicio
    When asigno el Resource fuera de servicio
    Then la tarifa se actualiza con éxito

  Scenario: Rechazar un Resource archivado
    Given existe una tarifa base activa
    And un Resource está archivado
    When intento asignar el Resource archivado
    Then recibo HTTP 409
    And la tarifa permanece sin cambios

  Scenario: Ocultar un Resource de otro negocio
    Given existe una tarifa base activa
    And existe un Resource de otro negocio
    When intento asignar el Resource de otro negocio
    Then recibo HTTP 404
