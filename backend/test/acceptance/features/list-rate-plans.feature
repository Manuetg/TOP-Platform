Feature: Descubrir planes de tarifas para el frontend
  Scenario: Listar un catálogo vacío
    When listo el catálogo de tarifas del negocio
    Then recibo un catálogo de tarifas vacío

  Scenario: Listar una tarifa activa en el catálogo
    Given existe una tarifa base activa
    When listo el catálogo de tarifas del negocio
    Then recibo la tarifa en el catálogo público

  Scenario: Conservar una tarifa archivada en el catálogo histórico
    Given existe una tarifa archivada
    When listo el catálogo de tarifas del negocio
    Then recibo la tarifa archivada en el catálogo histórico

  Scenario: Listar una tarifa asignada y vigente para una estadía
    Given existe una tarifa activa asignada al Resource seleccionable
    When listo las tarifas seleccionables para la estadía
    Then recibo únicamente la tarifa seleccionable

  Scenario: Excluir una tarifa archivada de la selección
    Given existe un Resource activo para seleccionar tarifas
    And existe una tarifa archivada
    When listo las tarifas seleccionables para la estadía
    Then recibo un catálogo de tarifas vacío

  Scenario: Excluir una tarifa sin asignación
    Given existe un Resource activo para seleccionar tarifas
    And existe una tarifa base activa
    When listo las tarifas seleccionables para la estadía
    Then recibo un catálogo de tarifas vacío

  Scenario: Excluir una tarifa fuera de vigencia
    Given existe una tarifa activa asignada al Resource seleccionable
    When listo tarifas fuera de la vigencia aprobada
    Then recibo un catálogo de tarifas vacío

  Scenario: Rechazar un Resource fuera de servicio
    Given existe una tarifa base activa
    And un Resource está fuera de servicio
    When listo tarifas para el Resource no disponible
    Then la respuesta HTTP es 409

  Scenario: Ocultar un Resource de otro Business
    Given existe una tarifa base activa
    And existe un Resource de otro negocio
    When listo tarifas para el Resource de otro negocio
    Then la respuesta HTTP es 404
