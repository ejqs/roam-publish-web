import { z } from "zod";

/** Shared by the dashboard forms (client) and their actions (server). */
export const DESCRIPTION_MAX = 160;

/**
 * A short plain-text description (profile bio, graph front page). One paragraph: newlines and runs
 * of whitespace collapse to single spaces.
 */
export const Description = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(z.string().max(DESCRIPTION_MAX, `Keep it under ${DESCRIPTION_MAX} characters.`));
