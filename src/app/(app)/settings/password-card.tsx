"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PASSWORD_MIN } from "@/lib/sign-in-link";
import {
  changeAccountPassword,
  type PasswordResult,
  removeAccountPassword,
  setAccountPassword,
} from "@/server/actions/account";

type Mode = "idle" | "add" | "change" | "remove";

/** Optional password log in. Emailed links always work; see src/server/actions/account.ts. */
export function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<PasswordResult>, done: string) {
    setPending(true);
    setError(null);
    const res = await action();
    setPending(false);
    if (!res.ok) return setError(res.message);
    toast.success(done);
    setMode("idle");
    router.refresh();
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = String(form.get("new"));
    if (mode === "add") void run(() => setAccountPassword(next), "Password added.");
    else void run(() => changeAccountPassword(String(form.get("current")), next), "Password changed. Other devices are logged out.");
  }

  const cancel = () => {
    setMode("idle");
    setError(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          {hasPassword
            ? "You can log in with your password or with a link sent to your email."
            : "You log in with a link sent to your email. Add a password to also log in with it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mode === "idle" && (
          <div className="flex flex-wrap gap-2">
            {hasPassword ? (
              <>
                <Button variant="outline" onClick={() => setMode("change")}>
                  Change password
                </Button>
                <Button variant="outline" onClick={() => setMode("remove")}>
                  Remove password
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setMode("add")}>
                Add password
              </Button>
            )}
          </div>
        )}

        {(mode === "add" || mode === "change") && (
          <form onSubmit={onSubmit} className="max-w-sm">
            <FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {mode === "change" && (
                <Field>
                  <FieldLabel htmlFor="current">Current password</FieldLabel>
                  <Input id="current" name="current" type="password" autoComplete="current-password" required autoFocus />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="new">{mode === "add" ? "Password" : "New password"}</FieldLabel>
                <Input
                  id="new"
                  name="new"
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN}
                  required
                  autoFocus={mode === "add"}
                />
                <FieldDescription>At least {PASSWORD_MIN} characters.</FieldDescription>
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Spinner data-icon="inline-start" />}
                  {mode === "add" ? "Add password" : "Change password"}
                </Button>
                <Button type="button" variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}

        {mode === "remove" && (
          <FieldGroup className="max-w-sm">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <p className="text-sm">Remove your password? You&apos;ll log in with links sent to your email.</p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => void run(removeAccountPassword, "Password removed.")}
              >
                {pending && <Spinner data-icon="inline-start" />}
                Remove password
              </Button>
              <Button type="button" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
