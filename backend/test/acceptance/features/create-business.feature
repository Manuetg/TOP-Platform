Feature: Creación de negocio
  Scenario: Crear un negocio correctamente
    Given el backend de TOP está iniciado
    When creo un negocio llamado "Cabañas del Lago"
    Then recibo una respuesta de creación exitosa
    And el negocio creado está activo
