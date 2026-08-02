Feature: Creación administrativa de usuarios

  Scenario: Crear un usuario administrativo
    Given no existe un usuario con el email indicado
    When creo un usuario con email y contraseña válidos
    Then recibo HTTP 201
    And el email queda normalizado
    And el usuario queda ACTIVE
    And la respuesta no contiene password
    And la respuesta no contiene passwordHash

  Scenario: Rechazar email duplicado
    Given existe un usuario con el email normalizado
    When intento crear otro usuario usando mayúsculas y espacios en el mismo email
    Then recibo HTTP 409
    And no se crea un segundo usuario
    And no se crea una segunda credencial

  Scenario: Rechazar contraseña demasiado corta
    Given no existe el usuario
    When intento crearlo con una contraseña de 11 caracteres
    Then recibo HTTP 400
    And no se persiste User
    And no se persiste LocalCredential

  Scenario: Aceptar contraseña Unicode válida
    Given no existe el usuario
    When lo creo con una contraseña Unicode de al menos 12 caracteres
    Then recibo HTTP 201
    And la respuesta no expone datos sensibles
