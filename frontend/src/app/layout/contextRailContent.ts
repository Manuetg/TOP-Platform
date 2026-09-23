import type { ContextRailBlock } from "../../shared/ui/ContextRail";

// Non-essential guidance only; no tenant data, inferred status or duplicate navigation.
const content: Record<string, readonly ContextRailBlock[]> = {
  "/app/resources/new": [
    { title: "Una unidad reservable", description: "Cada recurso representa una unidad que podés reservar de forma independiente, como una habitación o cabaña." },
    { title: "Fácil de reconocer", description: "Usá un nombre y un código que tu equipo pueda identificar en el calendario y las reservas." },
  ],
  "/app/contacts/new": [
    { title: "Datos útiles", description: "Registrá los datos necesarios para reconocer y contactar al huésped. Revisalos antes de guardar." },
    { title: "Antes de crear", description: "Comprobá en Contactos si el huésped ya está registrado para evitar duplicados." },
  ],
  "/app/pricing/new": [
    { title: "Tarifas claras", description: "El nombre de la tarifa ayuda al equipo a elegirla durante la preparación de una reserva." },
    { title: "Revisá la vigencia", description: "Comprobá los recursos y las fechas a los que se aplica antes de guardar el plan." },
  ],
};

export function getContextRailContent(pathname: string) {
  return content[pathname.replace(/\/$/, "")] ?? null;
}
