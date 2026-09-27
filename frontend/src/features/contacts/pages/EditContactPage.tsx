import { z } from "zod";
import { ContactFormFields } from "../components/ContactFormFields";
import { normalizePhone } from "../utils/contact-phone";
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
    watch,
    setError,
    register,
    handleSubmit,
    reset,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm<CreateContactFormValues>({
    resolver: zodResolver(createContactSchema.extend({ lastName: z.string().trim().max(120), contactPhone: z.string().trim().max(120), country: z.string().max(120) })),
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

    const phoneUnchanged = values.contactPhone.trim() === (contact?.phone ?? contact?.whatsapp ?? "").trim();
    const contactPhone = phoneUnchanged ? values.contactPhone.trim() : normalizePhone(values.contactPhone, values.country);
    if (!phoneUnchanged && !contactPhone) { setError("contactPhone", { message: "Ingresa un teléfono válido con país o prefijo internacional." }, { shouldFocus: true }); return; }

    try {
      await updateContact({
        businessId: activeBusinessId,
        contactId,
        accessToken: session?.accessToken,
        input: {
          name: values.name.trim(),
          lastName: optionalValue(values.lastName),

          // La UI mantiene un único número operativo.
          // El contrato backend todavía conserva ambos campos.
          ...(phoneUnchanged ? {} : { phone: contactPhone, whatsapp: contactPhone }),

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
        <ContactFormFields register={register} errors={errors} country={watch("country")} phone={watch("contactPhone")} existingCountry={contact.country} />

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
