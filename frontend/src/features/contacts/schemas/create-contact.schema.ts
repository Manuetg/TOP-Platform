import { z } from "zod";
import { COUNTRIES } from "../constants/countries";

const optionalText = z
  .string()
  .trim()
  .max(120, "Máximo 120 caracteres.")
  .optional()
  .or(z.literal(""));

export const createContactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresá un nombre válido.")
    .max(120, "Máximo 120 caracteres."),

  lastName: z
    .string()
    .trim()
    .min(2, "Ingresá un apellido válido.")
    .max(120, "Máximo 120 caracteres."),

  contactPhone: z
    .string()
    .trim()
    .min(6, "Ingresá un teléfono válido.")
    .max(120, "Máximo 120 caracteres."),

  email: z
    .string()
    .trim()
    .max(120, "Máximo 120 caracteres.")
    .refine(
      (value) =>
        value.length === 0 ||
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "Ingresá un email válido.",
    ),

  documentType: z
    .enum(["CI", "PASSPORT"])
    .optional()
    .or(z.literal("")),

  documentNumber: optionalText,

  country: z
    .string()
    .refine(
      (value) =>
        value === "" ||
        COUNTRIES.includes(
          value as (typeof COUNTRIES)[number],
        ),
      "Seleccioná un país válido.",
    ),

  city: optionalText,
});

export type CreateContactFormValues = z.infer<
  typeof createContactSchema
>;