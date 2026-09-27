import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { Input } from "../../../shared/ui/Input";
import { COUNTRIES } from "../constants/countries";
import type { CreateContactFormValues } from "../schemas/create-contact.schema";
import { ContactPhoneField } from "./ContactPhoneField";

interface Props {
  register: UseFormRegister<CreateContactFormValues>;
  errors: FieldErrors<CreateContactFormValues>;
  country: string;
  phone: string;
  existingCountry?: string | null;
}

/** Alta y edición comparten composición; sus validaciones y payloads siguen en cada página. */
export function ContactFormFields({ register, errors, country, phone, existingCountry }: Props) {
  return <>
    <section className="contact-create-card">
      <div className="contact-create-card__header">
        <h2>Información personal</h2>
        <p>Datos básicos para identificar al contacto.</p>
      </div>
      <div className="contact-form-fields">
        <Input label="Nombre *" autoComplete="given-name" maxLength={120} error={errors.name?.message} {...register("name")} />
        <Input label="Apellido *" autoComplete="family-name" maxLength={120} error={errors.lastName?.message} {...register("lastName")} />
        <div className="top-field">
          <label className="top-field__label" htmlFor="contact-document-type">Tipo de documento</label>
          <select className="top-input" id="contact-document-type" aria-invalid={Boolean(errors.documentType)} aria-describedby={errors.documentType ? "contact-document-type-error" : undefined} {...register("documentType")}>
            <option value="">Seleccionar</option>
            <option value="CI">CI</option>
            <option value="PASSPORT">Pasaporte</option>
          </select>
          {errors.documentType && <p id="contact-document-type-error" className="top-field__error">{errors.documentType.message}</p>}
        </div>
        <Input label="Número de documento" maxLength={120} error={errors.documentNumber?.message} {...register("documentNumber")} />
      </div>
    </section>
    <section className="contact-create-card">
      <div className="contact-create-card__header">
        <h2>Contacto</h2>
        <p>El país de residencia también sugiere el prefijo para llamadas y WhatsApp.</p>
      </div>
      <div className="contact-form-fields">
        <div className="top-field">
          <label className="top-field__label" htmlFor="contact-country">País</label>
          <select className="top-input" id="contact-country" autoComplete="country-name" aria-invalid={Boolean(errors.country)} aria-describedby={errors.country ? "contact-country-error" : undefined} {...register("country")}>
            <option value="">Seleccionar país</option>
            {existingCountry && !COUNTRIES.some((item) => item === existingCountry) && <option value={existingCountry}>{existingCountry}</option>}
            {COUNTRIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          {errors.country && <p id="contact-country-error" className="top-field__error">{errors.country.message}</p>}
        </div>
        <ContactPhoneField country={country} phone={phone} error={errors.contactPhone?.message} {...register("contactPhone")} />
        <Input label="Email" type="email" autoComplete="email" maxLength={120} placeholder="nombre@ejemplo.com" error={errors.email?.message} {...register("email")} />
      </div>
    </section>
    <section className="contact-create-card">
      <div className="contact-create-card__header">
        <h2>Ubicación</h2>
        <p>Ciudad de residencia, opcional.</p>
      </div>
      <div className="contact-form-fields">
        <Input label="Ciudad" autoComplete="address-level2" maxLength={120} error={errors.city?.message} {...register("city")} />
      </div>
    </section>
  </>;
}
