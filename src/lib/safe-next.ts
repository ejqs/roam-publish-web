/**
 * Only allow same-site relative redirects. Browsers drop tabs and newlines from URLs and read "\"
 * as "/", so "/\t/evil.com" would become "//evil.com": anything with whitespace, a control
 * character or a backslash is refused outright, and what's left must stay on the same origin.
 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || /[\s\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  const base = "https://same.invalid";
  if (new URL(next, base).origin !== base) return fallback;
  return next;
}

/** Where to send someone who already has a session. Never send them back to an auth form. */
export function signedInRedirect(next: string | null | undefined) {
  const dest = safeNext(next);
  const path = dest.split("?")[0];
  if (path === "/login" || path === "/signup" || path === "/forgot-password" || path === "/reset-password") {
    return "/dashboard";
  }
  return dest;
}
