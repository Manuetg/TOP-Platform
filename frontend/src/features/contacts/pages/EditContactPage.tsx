import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Save,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { COUNTRIES } from "../constants/countries";
import { useContact } from "../queries/use-contact";
import {
  createContactSchema,
  type CreateContactFormValues,
} from "../schemas/create-contact.schema";
import { updateContact } from "../api/update-contact";
import "./CreateContactPage.css";
import "./EditContactPage.css";


function optionalValue(value?: string) {
  const normalized = value?.trim() ?? "";

  return normalized.length > 0
    ? normalized
    : null;
}

function getDocumentTypeFormValue(
  value: string | null,
): CreateContactFormValues["documentType"] {
  if (value === "CI") {
    return "CI";
  }

  if (
    value === "Pasaporte" ||
    value === "PASSPORT"
  ) {
    return "PASSPORT";
  }

  return "";
}

export function EditContactPage() {
  const navigate = useNavigate();
  const { contactId = "" } = useParams();
  const { session } = useAuth();
  const { activeBusinessId } = useBusinessContext();

  const [submitError, setSubmitError] =
    useState<string | null>(null);

  const {
    data: contact,
    isLoading,
    isError,
    error,
    refetch,
  } = useContact({
    businessId: activeBusinessId,
    contactId,
    accessToken: session?.accessToken,
  });

  const {
    register,
    handleSubmit,
    reset,
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
      country: "",
      city: "",
    },
  });

  useEffect(() => {
    if (!contact) {
      return;
    }

    reset({
      name: contact.name,
      lastName: contact.lastName ?? "",
      contactPhone:
        contact.phone ??
        contact.whatsapp ??
        "",
      email: contact.email ?? "",
      documentType:
        getDocumentTypeFormValue(
          contact.documentType,
        ),
      documentNumber:
        contact.documentNumber ?? "",
      country: contact.country ?? "",
      city: contact.city ?? "",
    });
  }, [contact, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!activeBusinessId || !contactId) {
      setSubmitError(
        "No se pudo determinar el contacto activo.",
      );
      return;
    }

    setSubmitError(null);

    const contactPhone =
      values.contactPhone.trim();

    try {
      await updateContact({
        businessId: activeBusinessId,
        contactId,
        accessToken: session?.accessToken,
        input: {
          name: values.name.trim(),
          lastName: values.lastName.trim(),

          // La UI mantiene un único número operativo.
          // El contrato backend todavía conserva ambos campos.
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

      navigate(`/app/contacts/${contactId}`);
    } catch (submitFailure) {
      setSubmitError(
        submitFailure instanceof Error
          ? submitFailure.message
          : "No pudimos actualizar el contacto.",
      );
    }
  });

  if (isLoading) {
    return (
      <section
        className="contact-create-page"
        aria-busy="true"
      >
        <div className="contact-edit-state">
          <div
            className="contact-edit-state__icon"
            aria-hidden="true"
          >
            <UserRound size={28} />
          </div>

          <h1>Cargando contacto</h1>

          <p>
            Estamos preparando los datos para editar.
          </p>
        </div>
      </section>
    );
  }

  if (isError || !contact) {
    return (
      <section className="contact-create-page">
        <button
          type="button"
          className="contact-create-back"
          onClick={() =>
            navigate("/app/contacts")
          }
        >
          <ArrowLeft
            size={16}
            aria-hidden="true"
          />
          Volver a Contactos
        </button>

        <div
          className="contact-edit-state"
          role="alert"
        >
          <div
            className="contact-edit-state__icon"
            aria-hidden="true"
          >
            <UserRound size={28} />
          </div>

          <h1>
            No pudimos cargar el contacto
          </h1>

          <p>
            {error instanceof Error
              ? error.message
              : "Ocurrió un error inesperado."}
          </p>

          <Button
            type="button"
            variant="secondary"
            onClick={() => void refetch()}
          >
            Reintentar
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="contact-create-page"
      aria-labelledby="contact-edit-title"
    >
      <button
        type="button"
        className="contact-create-back"
        onClick={() =>
          navigate(`/app/contacts/${contactId}`)
        }
      >
        <ArrowLeft
          size={16}
          aria-hidden="true"
        />
        Volver al contacto
      </button>

      <header className="contact-create-header">
        <span className="contact-create-eyebrow">
          Contactos
        </span>

        <h1 id="contact-edit-title">
          Editar contacto
        </h1>

        <p>
          Actualizá los datos de {contact.fullName}.
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
                  errors.name
                    ? "true"
                    : "false"
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
                  errors.city
                    ? "true"
                    : "false"
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
              navigate(`/app/contacts/${contactId}`)
            }
            disabled={isSubmitting}
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting}
          >
            <Save
              size={18}
              aria-hidden="true"
            />

            {isSubmitting
              ? "Guardando…"
              : "Guardar cambios"}
          </Button>
        </footer>
      </form>
    </section>
  );
}
