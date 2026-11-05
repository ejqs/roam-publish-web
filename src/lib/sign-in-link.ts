/** Shared by the server (src/lib/auth.ts) and the log in and sign up forms. */

/** How long an emailed sign-in link works. Each link works once. */
export const MAGIC_LINK_MINUTES = 15;

/**
 * The message for the `error` a sign-in link sends people back with (better-auth's magic-link verify
 * redirects to errorCallbackURL with `error` and, for some, `error_description`), or null for none.
 */
export function linkError(code: string | null, description: string | null): string | null {
  if (!code) return null;
  if (code === "INVALID_TOKEN") return "That link has expired or was already used. Send a new one.";
  if (code === "BANNED_USER") return "This account has been suspended. Check your email for details.";
  return description || "Could not log in with that link. Send a new one.";
}

/** Shortest account password accepted (Better Auth's default, set explicitly in src/lib/auth.ts). */
export const PASSWORD_MIN = 8;
