import { z } from "zod";

export const searchPublishedResultSchema = z.object({
  body: z.object({
    registerNumber: z
      .string()
      .trim()
      .min(2, "Register number is required")
      .max(50, "Register number must not exceed 50 characters"),
    studentPin: z.string().trim().regex(/^\\d{10}$/, "Student PIN must be a 10-digit number")
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});