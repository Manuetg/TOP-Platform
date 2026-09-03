Feature: Lectura de imágenes de Resource

  Scenario: Listar imágenes públicas ordenadas
    Given existe un recurso activo
    And existe un recurso activo con imágenes ordenables
    When consulto sus imágenes
    Then recibo imágenes públicas ordenadas sin storageKey

  Scenario: Un Resource sin imágenes devuelve una colección vacía
    Given existe un recurso activo
    When consulto sus imágenes
    Then recibo una lista vacía de imágenes

  Scenario: Las imágenes de otro negocio no se exponen
    Given existe un recurso de otro negocio
    When consulto sus imágenes
    Then recibo HTTP 404

  Scenario: Un Business archivado no permite leer imágenes
    Given existe un recurso activo
    And el negocio del recurso está archivado
    When consulto sus imágenes
    Then recibo HTTP 409
