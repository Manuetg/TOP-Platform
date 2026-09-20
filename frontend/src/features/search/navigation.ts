export const moduleOptions = [
  { id: "home", label: "Inicio" }, { id: "calendar", label: "Calendario" },
  { id: "bookings", label: "Reservas" }, { id: "availability", label: "Disponibilidad" },
  { id: "resources", label: "Recursos" }, { id: "contacts", label: "Contactos" },
  { id: "pricing", label: "Precios" }, { id: "payments", label: "Pagos" },
  { id: "blocks", label: "Bloqueos" }, { id: "settings", label: "Configuración" },
] as const;
export type ModuleTarget = typeof moduleOptions[number]["id"];
export const entityPaths = { resource: "/app/resources", contact: "/app/contacts", booking: "/app/bookings" } as const;
export const groupNames = { resource: "Recursos", contact: "Contactos", booking: "Reservas" } as const;
