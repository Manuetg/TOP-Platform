import { useId, type ComponentProps } from "react";
import { phonePrefix } from "../utils/contact-phone";
import "./ContactFormFields.css";

type Props = ComponentProps<"input"> & {
  country: string;
  phone: string;
  label?: string;
  error?: string;
};

export function ContactPhoneField({ country, phone, label = "Teléfono / WhatsApp *", error, id, ...inputProps }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  return <div className="top-field contact-phone-field">
    <label className="top-field__label" htmlFor={inputId}>{label}</label>
    <div className="contact-phone-control">
      <span aria-label="Prefijo internacional">{phonePrefix(country, phone)}</span>
      <input {...inputProps} className="top-input" id={inputId} type="tel" autoComplete="tel" maxLength={120} placeholder="Ej. 0981 123 456" aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`} aria-invalid={Boolean(error)} />
    </div>
    <small id={helpId} className="contact-field-help">Usa el país seleccionado para un número nacional o pega el número completo con +. Un prefijo internacional explícito se conserva.</small>
    {error && <p id={errorId} className="top-field__error" role="alert">{error}</p>}
  </div>;
}
