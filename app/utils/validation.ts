import { z } from "zod";

export const rsvpFormSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  notes: z.string().max(500, "Notes must be less than 500 characters").optional(),
});

export type RSVPFormData = z.infer<typeof rsvpFormSchema>;

export const waiverFormSchema = z.object({
  consent: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the waiver to continue" }),
  }),
});

export type WaiverFormData = z.infer<typeof waiverFormSchema>;

export function parseFormData<T extends z.ZodSchema>(
  formData: FormData,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; errors: Record<string, string> } {
  const data: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      // Handle checkbox for consent field
      if (key === "consent") {
        data[key] = value === "on" || value === "true";
      } else {
        data[key] = value;
      }
    }
  }

  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const error of result.error.errors) {
    const path = error.path.join(".");
    errors[path] = error.message;
  }

  return { success: false, errors };
}
