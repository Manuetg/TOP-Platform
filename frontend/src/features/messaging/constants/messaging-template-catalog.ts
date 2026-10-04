import type { MessagingAutomationType } from "../types/messaging.types";

export const messagingTemplateDefaults: Record<MessagingAutomationType, string> = {
  BOOKING_CONFIRMED: [
    "Tu reserva en {{businessName}} fue confirmada.",
    "",
    "{{resourceName}}",
    "{{checkIn}} → {{checkOut}}",
    "{{guests}}",
    "",
    "Total confirmado: {{total}} {{currency}}.",
  ].join("\n"),
  BOOKING_CANCELLED: [
    "Tu reserva en {{businessName}} fue cancelada.",
    "",
    "{{resourceName}}",
    "{{checkIn}} → {{checkOut}}",
  ].join("\n"),
};

export const messagingTemplateVariables = [
  { name: "businessName", label: "Nombre del negocio" },
  { name: "guestName", label: "Nombre del huésped" },
  { name: "resourceName", label: "Nombre del recurso" },
  { name: "checkIn", label: "Check-in" },
  { name: "checkOut", label: "Check-out" },
  { name: "guests", label: "Huéspedes" },
  { name: "total", label: "Total" },
  { name: "currency", label: "Moneda" },
] as const;

export const messagingTemplatePreviewValues: Record<string, string> = {
  businessName: "Cabañas del Lago",
  guestName: "Juan Pérez",
  resourceName: "Cabaña Premium",
  checkIn: "15/10/2026",
  checkOut: "17/10/2026",
  guests: "4",
  total: "1.250.000",
  currency: "Gs.",
};

// El backend aún no publica un catálogo de variables/defaults versionado.
// Mantener este mapa alineado con MessagingTemplateRenderer hasta contar con ese contrato.

