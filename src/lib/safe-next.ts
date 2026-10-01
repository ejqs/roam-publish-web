/** Only allow same-site relative redirects. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
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
