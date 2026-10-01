import { z } from "zod";

/** Shared by the dashboard form (client) and the update action (server). */
export const BIO_MAX = 160;

/** Plain text, one paragraph: newlines and runs of whitespace collapse to single spaces. */
export const Bio = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(z.string().max(BIO_MAX, `Keep it under ${BIO_MAX} characters.`));
