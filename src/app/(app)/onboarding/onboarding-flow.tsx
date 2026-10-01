"use client";

import { CheckCircle2Icon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { checkVerification, startVerification } from "./actions";

function todayMMDDYYYY() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}-${d.getFullYear()}`;
}

const PREREQUISITES = [
  {
    id: "installed",
    label: "I've installed the Roam Publish extension",
    description: "In Roam: Settings → Roam Depot → search for Roam Publish → Install. Do this in the graph you're connecting.",
  },
] as const;

type State =
  | { step: "form" }
  | { step: "waiting"; verificationId: string; graphName: string }
  | { step: "done"; graphName: string }
  | { step: "expired" };

export function OnboardingFlow({ initialGraph }: { initialGraph: string }) {
  const [state, setState] = useState<State>({ step: "form" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const ready = PREREQUISITES.every((p) => checked.has(p.id));

  function toggle(id: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  useEffect(() => {
    if (state.step !== "waiting") return;
    const id = setInterval(async () => {
      const r = await checkVerification(state.verificationId);
      if (r.consumed) setState({ step: "done", graphName: state.graphName });
      else if (r.expired) setState({ step: "expired" });
    }, 3000);
    return () => clearInterval(id);
  }, [state]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const r = await startVerification({
      graphName: String(form.get("graphName")),
      token: String(form.get("token")),
      date: todayMMDDYYYY(),
    });
    setPending(false);
    if (!r.ok) return setError(r.error);
    setState({ step: "waiting", verificationId: r.verificationId, graphName: r.graphName });
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Connect your graph</h1>
        <p className="text-muted-foreground">
          Link a Roam graph to your account so the extension can publish from it.
        </p>
      </div>

      {state.step === "form" && (
        <Card>
          <CardHeader>
            <CardTitle>Verify graph ownership</CardTitle>
            <CardDescription>
              We&apos;ll write a one-time code to today&apos;s daily note. The Roam Publish
              extension reads it and finishes setup automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit}>
              <FieldGroup>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <FieldSet>
                  <FieldLegend variant="label">Before you start</FieldLegend>
                  <FieldGroup data-slot="checkbox-group">
                    {PREREQUISITES.map((p) => (
                      <Field key={p.id} orientation="horizontal">
                        <Checkbox
                          id={`prereq-${p.id}`}
                          checked={checked.has(p.id)}
                          onCheckedChange={(v) => toggle(p.id, !!v)}
                        />
                        <FieldContent>
                          <FieldLabel htmlFor={`prereq-${p.id}`} className="font-normal">
                            {p.label}
                          </FieldLabel>
                          <FieldDescription>{p.description}</FieldDescription>
                        </FieldContent>
                      </Field>
                    ))}
                  </FieldGroup>
                </FieldSet>
                <Field>
                  <FieldLabel htmlFor="graphName">Graph name</FieldLabel>
                  <Input id="graphName" name="graphName" defaultValue={initialGraph} placeholder="my-graph" required />
                  <FieldDescription>
                    As it appears in your Roam URL: roamresearch.com/#/app/<strong>my-graph</strong>
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="token">Append-only API token</FieldLabel>
                  <Input id="token" name="token" type="password" placeholder="roam-graph-token-…" autoComplete="off" required />
                  <FieldDescription>
                    In Roam: Settings → Graph → API tokens → New API token, and choose{" "}
                    <strong>append-only access</strong>.
                  </FieldDescription>
                </Field>
                <Alert>
                  <ShieldCheckIcon />
                  <AlertTitle>How we use this token</AlertTitle>
                  <AlertDescription>
                    Used once to add a verification block to today&apos;s daily note, then
                    discarded. You can delete the token and the block after setup.
                  </AlertDescription>
                </Alert>
                <Button type="submit" disabled={pending || !ready}>
                  {pending && <Spinner data-icon="inline-start" />}
                  Verify graph
                </Button>
                {!ready && (
                  <FieldDescription className="-mt-3 text-center">
                    Confirm you&apos;ve installed the extension to continue.
                  </FieldDescription>
                )}
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      )}

      {state.step === "waiting" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Spinner /> Return to Roam
            </CardTitle>
            <CardDescription>
              A verification block was added to today&apos;s daily note in{" "}
              <strong>{state.graphName}</strong>. Keep Roam open with the Roam Publish extension
              enabled. It will finish setup automatically. If nothing happens, open the extension
              settings and click <strong>Finish setup</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This page updates once the extension connects. The code expires in 15 minutes.
          </CardContent>
        </Card>
      )}

      {state.step === "done" && (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>{state.graphName} is connected</AlertTitle>
          <AlertDescription>
            <p>
              You can now right-click any page or block in Roam and choose Publish. Feel free to delete
              the verification block and the append-only token.
            </p>
            <Link href="/dashboard" className={buttonVariants({ variant: "outline", className: "mt-2" })}>
              Go to dashboard
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {state.step === "expired" && (
        <Alert variant="destructive">
          <AlertTitle>The verification code expired</AlertTitle>
          <AlertDescription>
            <Button variant="outline" className="mt-2" onClick={() => setState({ step: "form" })}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
