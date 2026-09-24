import { ContactFormFields } from "../components/ContactFormFields";
import { normalizePhone } from "../utils/contact-phone";
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
import { useBusinessContext } from "../../business/context/BusinessContext";
import { createContact } from "../api/create-contact";
import {
  createContactSchema,
  type CreateContactFormValues,
} from "../schemas/create-contact.schema";
import "./CreateContactPage.css";


function optionalValue(value?: string) {
  const normalized = value?.trim() ?? "";

  return normalized.length > 0
    ? normalized
    : null;
}

export function CreateContactPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { activeBusinessId } = useBusinessContext();

  const [submitError, setSubmitError] =
    useState<string | null>(null);

  const {
    watch,
    setError,
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
    if (!activeBusinessId) {
      setSubmitError(
        "No se pudo determinar el Business activo.",
      );
      return;
    }

    setSubmitError(null);

    const contactPhone = normalizePhone(values.contactPhone, values.country);
    if (!contactPhone) { setError("contactPhone", { message: "Ingresa un teléfono válido con país o prefijo internacional." }, { shouldFocus: true }); return; }

    try {
      const contact = await createContact({
        businessId: activeBusinessId,
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
        <ContactFormFields register={register} errors={errors} country={watch("country")} phone={watch("contactPhone")} />

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
