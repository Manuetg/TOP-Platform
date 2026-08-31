import { z } from "zod";

export const createResourceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres.")
      .max(120, "El nombre no puede superar 120 caracteres."),

    internalCode: z
      .string()
      .trim()
      .min(2, "El código debe tener al menos 2 caracteres.")
      .max(30, "El código no puede superar 30 caracteres.")
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Usá solo letras, números, guiones y guiones bajos.",
      ),

    description: z
      .string()
      .trim()
      .max(500, "La descripción no puede superar 500 caracteres.")
      .optional(),

    capacityMinimum: z.coerce
      .number()
      .int("Debe ser un número entero.")
      .min(1, "El mínimo debe ser al menos 1."),

    capacityMaximum: z.coerce
      .number()
      .int("Debe ser un número entero.")
      .min(1, "El máximo debe ser al menos 1.")
      .max(50, "El máximo permitido es 50."),

    capacityMaximumChildren: z.coerce
      .number()
      .int("Debe ser un número entero.")
      .min(0, "No puede ser menor que 0."),

    sortOrder: z.coerce
      .number()
      .int("Debe ser un número entero.")
      .min(0, "El orden no puede ser negativo.")
      .max(9999, "El orden máximo es 9999."),
  })
  .refine(
    (data) => data.capacityMinimum <= data.capacityMaximum,
    {
      message: "La capacidad mínima no puede superar la máxima.",
      path: ["capacityMinimum"],
    },
  )
  .refine(
    (data) =>
      data.capacityMaximumChildren <= data.capacityMaximum,
    {
      message:
        "La capacidad de niños no puede superar la capacidad máxima.",
      path: ["capacityMaximumChildren"],
    },
  );

export type CreateResourceFormInput = z.input<
  typeof createResourceSchema
>;

export type CreateResourceFormValues = z.output<
  typeof createResourceSchema
>;
