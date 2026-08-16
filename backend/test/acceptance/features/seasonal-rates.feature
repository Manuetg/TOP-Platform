Feature: Gestionar precios estacionales

  Scenario: Crear una temporada de Navidad
    Given existe una tarifa base activa
    When creo la temporada Navidad
    Then recibo HTTP 201
    And recibo la temporada pública Navidad

  Scenario: Listar temporadas en orden
    Given existe una tarifa base activa
    And existen dos temporadas contiguas
    When listo las temporadas de la tarifa
    Then recibo HTTP 200
    And recibo las temporadas en orden

  Scenario: Permitir temporadas contiguas
    Given existe una tarifa base activa
    And existe una temporada Navidad
    When creo una temporada contigua
    Then recibo HTTP 201

  Scenario: Rechazar temporadas solapadas
    Given existe una tarifa base activa
    And existe una temporada Navidad
    When intento crear una temporada solapada
    Then recibo HTTP 409

  Scenario: Rechazar temporada fuera de vigencia
    Given existe una tarifa base activa
    When intento crear una temporada fuera de vigencia
    Then recibo HTTP 409

  Scenario: Bloquear una tarifa archivada
    Given existe una tarifa archivada
    When creo la temporada Navidad
    Then recibo HTTP 409

  Scenario: Bloquear un negocio archivado
    Given existe una tarifa base activa
    And existe un negocio archivado
    When creo la temporada Navidad
    Then recibo HTTP 409

  Scenario: Ocultar una tarifa de otro negocio
    Given existe una tarifa base activa
    When creo una temporada desde otro negocio
    Then recibo HTTP 404

  Scenario: Evitar reducir una tarifa que excluiría una temporada
    Given existe una tarifa base activa
    And existe una temporada Navidad
    When reduzco la vigencia final de la tarifa
    Then recibo HTTP 409
