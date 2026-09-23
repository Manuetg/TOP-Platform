# language: es
Característica: Cupo operativo del establecimiento
  Escenario: El plan muestra uso real sin contar archivados
    Dado un plan TOP Inicial con recursos activos, fuera de servicio y archivados
    Cuando consulto el cupo operativo del establecimiento
    Entonces el cupo muestra dos usados y ocho disponibles

  Escenario: Solicitar ampliación conserva la operación sin cambiar el plan
    Dado un plan TOP Inicial con recursos activos, fuera de servicio y archivados
    Cuando solicito ampliación dos veces
    Entonces queda una solicitud con la misma fecha y el cupo original
