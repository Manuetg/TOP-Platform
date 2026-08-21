Feature: Gestionar Contacts
  Scenario: Crear, consultar y actualizar un Contact
    Given no existe un Contact para la prueba
    When creo un Contact mínimo
    Then recibo HTTP 201
    When consulto el Contact creado
    Then recibo HTTP 200
    When actualizo la ciudad del Contact
    Then recibo HTTP 200
    And recibo el Contact público actualizado

  Scenario: Buscar Contacts solo dentro del Business
    Given existe un Contact en otro negocio
    When busco Contacts por María
    Then recibo HTTP 200
    And recibo una lista vacía de Contacts
