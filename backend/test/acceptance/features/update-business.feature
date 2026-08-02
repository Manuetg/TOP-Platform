Feature: Actualización de negocio
  Scenario: Actualizar parcialmente un negocio existente
    Given el backend de TOP está iniciado
    And existe un negocio con nombre, razón social, RUC, zona horaria y moneda
    When actualizo el negocio con nombre "Cabañas Nuevas" y razón social "Cabañas Nuevas S.A."
    Then recibo HTTP 200
    And el nombre y la razón social quedan actualizados
    And el RUC, zona horaria y moneda permanecen sin cambios
    And la respuesta no contiene businessNumber

  Scenario: Limpiar datos opcionales
    Given el backend de TOP está iniciado
    And existe un negocio con razón social y RUC
    When actualizo razón social y RUC a null
    Then recibo HTTP 200
    And razón social y RUC quedan en null

  Scenario: Rechazar actualización inválida
    Given el backend de TOP está iniciado
    And existe un negocio
    When intento actualizarlo con una moneda distinta de PYG
    Then recibo HTTP 400
    And el negocio no se modifica

  Scenario: Rechazar zona horaria inválida
    Given el backend de TOP está iniciado
    And existe un negocio
    When intento actualizarlo con una zona horaria inválida
    Then recibo HTTP 400
    And recibo el mensaje de zona horaria inválida
