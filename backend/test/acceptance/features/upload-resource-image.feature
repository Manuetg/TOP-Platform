Feature: Cargar imágenes de recursos

  Scenario: Cargar imágenes permitidas y asignar orden consecutivo
    Given existe un recurso activo para cargar imágenes
    When cargo una imagen JPEG al recurso
    Then recibo HTTP 201
    And recibo una imagen pública con URL y orden 0
    When cargo una imagen PNG al recurso
    Then recibo HTTP 201
    And recibo una imagen pública con URL y orden 1

  Scenario: Permitir imágenes para un recurso fuera de servicio
    Given existe un recurso fuera de servicio para cargar imágenes
    When cargo una imagen WEBP al recurso
    Then recibo HTTP 201
    And recibo una imagen pública con URL y orden 0

  Scenario: Rechazar una imagen inválida o sin archivo
    Given existe un recurso activo para cargar imágenes
    When cargo una imagen con MIME inválido al recurso
    Then recibo HTTP 400
    When cargo una solicitud sin archivo al recurso
    Then recibo HTTP 400

  Scenario: Respetar el aislamiento y los estados archivados
    Given existe un recurso de otro negocio para cargar imágenes
    When cargo una imagen JPEG al recurso
    Then recibo HTTP 404
    Given existe un recurso activo para cargar imágenes
    And el negocio del recurso está archivado
    When cargo una imagen JPEG al recurso
    Then recibo HTTP 409

  Scenario: Rechazar una imagen cuando se alcanzó el máximo permitido
    Given existe un recurso con diez imágenes
    When cargo una imagen JPEG al recurso
    Then recibo HTTP 409
    Given existe un recurso archivado para cargar imágenes
    When cargo una imagen JPEG al recurso
    Then recibo HTTP 409
