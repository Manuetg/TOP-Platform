# language: es
Característica: Búsqueda global limitada del negocio
  Escenario: Resultados agrupados sin datos privados
    Dado una búsqueda global con seis recursos autorizados
    Cuando busco globalmente "Cabaña"
    Entonces recibo cinco recursos y un indicador de más resultados
    Y la búsqueda global no expone campos privados

  Escenario: Consulta vacía inválida
    Dado una búsqueda global con seis recursos autorizados
    Cuando busco globalmente " "
    Entonces la búsqueda global rechaza la consulta
