import type { UseFormRegisterReturn } from "react-hook-form";
import { phonePrefix } from "../utils/contact-phone";

export function ContactPhoneField({ country, value, registration, error }: { country: string; value: string; registration: UseFormRegisterReturn; error?: string }) {
  return <div className="contact-create-field">
    <label htmlFor="contact-phone">Teléfono / WhatsApp *</label>
    <div className="contact-phone-control">
      <span aria-label="Prefijo internacional">{phonePrefix(country, value)}</span>
      <input className="top-input" id="contact-phone" type="tel" autoComplete="tel" maxLength={120} placeholder="Ej. 0981 123 456" aria-describedby={`contact-phone-help${error ? " contact-phone-error" : ""}`} aria-invalid={Boolean(error)} {...registration} />
    </div>
    <small id="contact-phone-help">Usa el país seleccionado para un número nacional o pega el número completo con +. Un prefijo internacional explícito se conserva.</small>
    {error && <small id="contact-phone-error" role="alert">{error}</small>}
  </div>;
}
