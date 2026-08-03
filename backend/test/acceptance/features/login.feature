Feature: Inicio de sesión

  Scenario: Iniciar sesión correctamente
    Given existe un usuario habilitado para iniciar sesión
    When inicio sesión con sus credenciales válidas
    Then recibo HTTP 200
    And recibo un token Bearer de 900 segundos

  Scenario: Iniciar sesión con email normalizado
    Given existe un usuario habilitado para iniciar sesión
    When inicio sesión usando espacios y mayúsculas en el email
    Then recibo HTTP 200
    And el email de la sesión está normalizado

  Scenario: Iniciar sesión sin membresías
    Given existe un usuario habilitado sin membresías
    When inicio sesión con sus credenciales válidas
    Then recibo HTTP 200
    And recibo una lista vacía de membresías

  Scenario: Iniciar sesión con varias membresías
    Given existe un usuario habilitado con varias membresías
    When inicio sesión con sus credenciales válidas
    Then recibo HTTP 200
    And recibo las membresías disponibles

  Scenario: Rechazar credenciales incorrectas
    Given existe un usuario habilitado para iniciar sesión
    When inicio sesión con una contraseña incorrecta
    Then recibo HTTP 401

  Scenario: Rechazar usuario deshabilitado
    Given existe un usuario deshabilitado para iniciar sesión
    When inicio sesión con sus credenciales válidas
    Then recibo HTTP 403
