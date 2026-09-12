// MOCK: no existen contratos agregados aprobados para estos widgets.
// Cada bloque identifica su historia de reemplazo en docs/14-Frontend-Backlog.md.
// No combinar estos valores con respuestas reales ni utilizarlos para tomar decisiones operativas.
export const dashboardPreviewMock = {
  upcomingCheckIns: {
    source: "MOCK",
    story: "FE-DSH-002",
    count: 7,
    period: "Próximos 7 días",
  },
  today: {
    source: "MOCK",
    story: "FE-DSH-003",
    date: "2026-09-12",
    weekday: "Sábado",
    counts: [
      { label: "Llegadas", count: 2 },
      { label: "Salidas", count: 1 },
      { label: "Reservas", count: 3 },
    ],
  },
  recentActivity: {
    source: "MOCK",
    story: "FE-DSH-004",
    items: [
      {
        kind: "booking",
        title: "Reserva confirmada",
        detail: "Cabaña Lapacho",
        time: "hace 2 h",
      },
      {
        kind: "payment",
        title: "Pago recibido",
        detail: "₲ 1.300.000",
        time: "hace 4 h",
      },
      {
        kind: "resource",
        title: "Recurso actualizado",
        detail: "Suite Bosque",
        time: "ayer",
      },
    ],
  },
  nextSteps: {
    source: "MOCK",
    story: "FE-DSH-005",
    items: [
      {
        title: "Completar perfil del negocio",
        detail: "Logo, descripción y datos",
        completed: false,
      },
      {
        title: "Configurar métodos de pago",
        detail: "Organiza los cobros de tu negocio",
        completed: false,
      },
      {
        title: "Crear primer recurso",
        detail: "Tu operación empieza aquí",
        completed: true,
      },
    ],
  },
} as const;
