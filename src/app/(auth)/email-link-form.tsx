"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { linkError, MAGIC_LINK_MINUTES } from "@/lib/sign-in-link";
import { safeNext } from "@/lib/safe-next";

/**
 * Log in and sign up both email a one-time link (better-auth's magic-link plugin, src/lib/auth.ts).
 * The link logs in whoever owns the address, and makes the account first if there isn't one, so the
 * two pages differ only in asking for a name and where a new account goes next.
 */
export function EmailLinkForm({ mode }: { mode: "login" | "signup" }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"), mode === "signup" ? "/onboarding" : "/dashboard");
  const [error, setError] = useState<string | null>(() => linkError(params.get("error"), params.get("error_description")));
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [lastEmail, setLastEmail] = useState("");
  const [pending, setPending] = useState(false);
  const here = mode === "login" ? "/login" : "/signup";
  const other = mode === "login" ? "/signup" : "/login";
  const withNext = (path: string) => `${path}?next=${encodeURIComponent(next)}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const name = form.get("name");
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      ...(name ? { name: String(name).trim() } : {}),
      callbackURL: next,
      newUserCallbackURL: mode === "signup" ? next : "/onboarding",
      errorCallbackURL: withNext(here),
    });
    setPending(false);
    if (error) {
      setError(
        error.status === 429
          ? "Too many links requested. Wait a minute and try again."
          : (error.message ?? "Could not send the link."),
      );
      return;
    }
    setLastEmail(email);
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <AuthCard
        title="Check your email"
        description={
          <>
            We sent a link to <strong className="text-foreground">{sentTo}</strong>. Open it to log in. It
            works once and expires in {MAGIC_LINK_MINUTES} minutes.
          </>
        }
        footer={
          <button type="button" className="text-link hover:underline" onClick={() => setSentTo(null)}>
            Send a new link or use a different email
          </button>
        }
      >
        <p className="text-sm text-muted-foreground">Not there? Check spam.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={mode === "login" ? "Log in to Roam Publish" : "Create your account"}
      description={
        mode === "login"
          ? "We'll email you a link to log in."
          : "You'll need an active Roam Research account to publish."
      }
      footer={
        <span>
          {mode === "login" ? "No account? " : "Already have an account? "}
          <Link href={withNext(other)} className="text-link hover:underline">
            {mode === "login" ? "Sign up" : "Log in"}
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit}>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {mode === "signup" && (
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" autoComplete="name" required />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus={mode === "login"} defaultValue={lastEmail} />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Email me a link
          </Button>
          <FieldDescription className="text-center">
            By continuing you agree to the{" "}
            <Link href="/terms" className="text-link hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-link hover:underline">
              Privacy policy
            </Link>
            .
          </FieldDescription>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
