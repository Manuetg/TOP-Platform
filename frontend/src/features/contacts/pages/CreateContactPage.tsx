import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { createContact } from "../api/create-contact";
import { COUNTRIES } from "../constants/countries";
import {
  createContactSchema,
  type CreateContactFormValues,
} from "../schemas/create-contact.schema";
import "./CreateContactPage.css";

const TEMP_BUSINESS_ID =
  import.meta.env.VITE_DEV_BUSINESS_ID ?? "";

function optionalValue(value?: string) {
  const normalized = value?.trim() ?? "";

  return normalized.length > 0
    ? normalized
    : null;
}

export function CreateContactPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [submitError, setSubmitError] =
    useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm<CreateContactFormValues>({
    resolver: zodResolver(createContactSchema),
    defaultValues: {
      name: "",
      lastName: "",
      contactPhone: "",
      email: "",
      documentType: "",
      documentNumber: "",
      country: "Paraguay",
      city: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!TEMP_BUSINESS_ID) {
      setSubmitError(
        "No se pudo determinar el Business activo.",
      );
      return;
    }

    setSubmitError(null);

    const contactPhone =
      values.contactPhone.trim();

    try {
      const contact = await createContact({
        businessId: TEMP_BUSINESS_ID,
        accessToken: session?.accessToken,
        input: {
          name: values.name.trim(),
          lastName: values.lastName.trim(),

          // La UI usa un único número operativo.
          // Se mantiene compatibilidad con el contrato
          // backend actual enviándolo a ambos campos.
          phone: contactPhone,
          whatsapp: contactPhone,

          email: optionalValue(values.email),

          documentType:
            values.documentType === "PASSPORT"
              ? "Pasaporte"
              : values.documentType === "CI"
                ? "CI"
                : null,

          documentNumber: optionalValue(
            values.documentNumber,
          ),

          country: optionalValue(values.country),
          city: optionalValue(values.city),
        },
      });

      navigate(`/app/contacts/${contact.id}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No pudimos crear el contacto.",
      );
    }
  });

  return (
    <section
      className="contact-create-page"
      aria-labelledby="contact-create-title"
    >
      <button
        type="button"
        className="contact-create-back"
        onClick={() => navigate("/app/contacts")}
      >
        <ArrowLeft
          size={16}
          aria-hidden="true"
        />
        Volver a Contactos
      </button>

      <header className="contact-create-header">
        <span className="contact-create-eyebrow">
          Contactos
        </span>

        <h1 id="contact-create-title">
          Nuevo contacto
        </h1>

        <p>
          Registrá los datos principales del huésped o
          contacto.
        </p>
      </header>

      <form
        className="contact-create-form"
        onSubmit={onSubmit}
        noValidate
      >
        <section className="contact-create-card">
          <div className="contact-create-card__header">
            <h2>Información personal</h2>

            <p>
              Datos básicos para identificar al contacto.
            </p>
          </div>

          <div className="contact-create-fields">
            <label className="contact-create-field">
              <span>Nombre *</span>

              <input
                type="text"
                autoComplete="given-name"
                maxLength={120}
                aria-invalid={
                  errors.name ? "true" : "false"
                }
                {...register("name")}
              />

              {errors.name && (
                <small role="alert">
                  {errors.name.message}
                </small>
              )}
            </label>

            <label className="contact-create-field">
              <span>Apellido *</span>

              <input
                type="text"
                autoComplete="family-name"
                maxLength={120}
                aria-invalid={
                  errors.lastName
                    ? "true"
                    : "false"
                }
                {...register("lastName")}
              />

              {errors.lastName && (
                <small role="alert">
                  {errors.lastName.message}
                </small>
              )}
            </label>

            <label className="contact-create-field">
              <span>Tipo de documento</span>

              <select
                aria-invalid={
                  errors.documentType
                    ? "true"
                    : "false"
                }
                {...register("documentType")}
              >
                <option value="">
                  Seleccionar
                </option>
                <option value="CI">
                  CI
                </option>
                <option value="PASSPORT">
                  Pasaporte
                </option>
              </select>

              {errors.documentType && (
                <small role="alert">
                  {errors.documentType.message}
                </small>
              )}
            </label>

            <label className="contact-create-field">
              <span>Número de documento</span>

              <input
                type="text"
                maxLength={120}
                aria-invalid={
                  errors.documentNumber
                    ? "true"
                    : "false"
                }
                {...register("documentNumber")}
              />

              {errors.documentNumber && (
                <small role="alert">
                  {errors.documentNumber.message}
                </small>
              )}
            </label>
          </div>
        </section>

        <section className="contact-create-card">
          <div className="contact-create-card__header">
            <h2>Contacto</h2>

            <p>
              Número principal para llamadas y WhatsApp.
            </p>
          </div>

          <div className="contact-create-fields">
            <label className="contact-create-field">
              <span>Teléfono / WhatsApp *</span>

              <input
                type="tel"
                autoComplete="tel"
                maxLength={120}
                placeholder="Ej. 0981 123 456"
                aria-invalid={
                  errors.contactPhone
                    ? "true"
                    : "false"
                }
                {...register("contactPhone")}
              />

              {errors.contactPhone && (
                <small role="alert">
                  {errors.contactPhone.message}
                </small>
              )}
            </label>

            <label className="contact-create-field">
              <span>Email</span>

              <input
                type="email"
                autoComplete="email"
                maxLength={120}
                placeholder="nombre@ejemplo.com"
                aria-invalid={
                  errors.email
                    ? "true"
                    : "false"
                }
                {...register("email")}
              />

              {errors.email && (
                <small role="alert">
                  {errors.email.message}
                </small>
              )}
            </label>
          </div>
        </section>

        <section className="contact-create-card">
          <div className="contact-create-card__header">
            <h2>Ubicación</h2>

            <p>
              Información opcional de residencia.
            </p>
          </div>

          <div className="contact-create-fields">
            <label className="contact-create-field">
              <span>País</span>

              <select
                autoComplete="country-name"
                aria-invalid={
                  errors.country
                    ? "true"
                    : "false"
                }
                {...register("country")}
              >
                <option value="">
                  Seleccionar país
                </option>

                {COUNTRIES.map((country) => (
                  <option
                    key={country}
                    value={country}
                  >
                    {country}
                  </option>
                ))}
              </select>

              {errors.country && (
                <small role="alert">
                  {errors.country.message}
                </small>
              )}
            </label>

            <label className="contact-create-field">
              <span>Ciudad</span>

              <input
                type="text"
                autoComplete="address-level2"
                maxLength={120}
                aria-invalid={
                  errors.city ? "true" : "false"
                }
                {...register("city")}
              />

              {errors.city && (
                <small role="alert">
                  {errors.city.message}
                </small>
              )}
            </label>
          </div>
        </section>

        {submitError && (
          <div
            className="contact-create-error"
            role="alert"
          >
            {submitError}
          </div>
        )}

        <footer className="contact-create-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              navigate("/app/contacts")
            }
            disabled={isSubmitting}
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting}
          >
            <Plus
              size={18}
              aria-hidden="true"
            />

            {isSubmitting
              ? "Creando…"
              : "Crear contacto"}
          </Button>
        </footer>
      </form>
    </section>
  );
}