"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { loginOptions } from "@/server/actions/login";

/**
 * Log in and sign up both email a one-time link (better-auth's magic-link plugin, src/lib/auth.ts).
 * The link logs in whoever owns the address, and makes the account first if there isn't one, so the
 * two pages differ only in asking for a name and where a new account goes next.
 */
/** Placeholders read as faint examples, well below the labels and typed text. */
const light = "placeholder:text-muted-foreground/45";

export function EmailLinkForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  // Log in only: once the email belongs to an account with a password (Settings), ask for it, with a
  // link as the other choice. Everyone else gets a link straight away.
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const next = safeNext(params.get("next"), mode === "signup" ? "/onboarding" : "/dashboard");
  const [error, setError] = useState<string | null>(() => linkError(params.get("error"), params.get("error_description")));
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [lastEmail, setLastEmail] = useState("");
  const [pending, setPending] = useState(false);
  const here = mode === "login" ? "/login" : "/signup";
  const other = mode === "login" ? "/signup" : "/login";
  const withNext = (path: string) => `${path}?next=${encodeURIComponent(next)}`;

  async function sendLink(email: string, name?: string) {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      ...(name ? { name } : {}),
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
    setPasswordFor(null);
    setSentTo(email);
  }

  async function logInWithPassword(email: string, password: string) {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password, callbackURL: next });
    if (!error) {
      router.push(next);
      router.refresh();
      return;
    }
    setPending(false);
    setError(
      error.status === 429
        ? "Too many tries. Wait a minute and try again."
        : error.code === "EMAIL_NOT_VERIFIED"
          ? "Log in with a link first to confirm your email."
          : "Wrong password.",
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (passwordFor) return logInWithPassword(passwordFor, String(form.get("password")));
    const email = String(form.get("email")).trim();
    const name = form.get("name");
    if (mode === "signup") return sendLink(email, name ? String(name).trim() : undefined);
    setPending(true);
    setError(null);
    const options = await loginOptions(email);
    if (!options.ok) {
      setPending(false);
      return setError(options.message);
    }
    if (!options.password) return sendLink(email);
    setPending(false);
    setLastEmail(email);
    setPasswordFor(email);
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
          ? passwordFor
            ? "Enter your password, or get a link by email."
            : "We'll email you a link to log in."
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
              <Input id="name" name="name" autoComplete="name" placeholder="Ann Lee" className={light} required />
            </Field>
          )}
          {passwordFor ? (
            <>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">{passwordFor}</span>
                <button
                  type="button"
                  className="shrink-0 text-link hover:underline"
                  onClick={() => {
                    setPasswordFor(null);
                    setError(null);
                  }}
                >
                  Change
                </button>
              </div>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
              </Field>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                Log in
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void sendLink(passwordFor)}
              >
                Email me a link instead
              </Button>
            </>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" className={light} required autoFocus={mode === "login"} defaultValue={lastEmail} />
              </Field>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                {mode === "login" ? "Continue" : "Email me a link"}
              </Button>
            </>
          )}
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
