Feature: Archivado de negocio
  Scenario: Archivar un negocio activo
    Given el backend de TOP está iniciado
    And existe un negocio activo
    When archivo el negocio
    Then recibo HTTP 200
    And su estado es ARCHIVED
    And el negocio conserva sus datos

  Scenario: Un negocio archivado no aparece en el listado activo
    Given el backend de TOP está iniciado
    And existe un negocio archivado
    And existe otro negocio activo
    When consulto la lista de negocios
    Then recibo únicamente el negocio activo

  Scenario: Archivar un negocio ya archivado
    Given el backend de TOP está iniciado
    And existe un negocio archivado
    When vuelvo a archivarlo
    Then recibo HTTP 200
    And su estado permanece ARCHIVED
