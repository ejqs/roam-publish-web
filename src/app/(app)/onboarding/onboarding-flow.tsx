"use client";

import { CheckCircle2Icon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import { KeyReveal } from "@/components/key-reveal";
import { verifyGraph } from "./actions";

function todayMMDDYYYY() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}-${d.getFullYear()}`;
}

const PREREQUISITES = [
  {
    id: "personal",
    label: "This is my own graph, or I manage this shared graph",
    description:
      "Start with your personal graph. For a shared graph, whoever connects it first owns it on roam.pub and invites everyone else, who then don't need a token.",
  },
] as const;

type State = { step: "form" } | { step: "done"; graphId: string; graphName: string };

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const r = await verifyGraph({
      graphName: String(form.get("graphName")),
      token: String(form.get("token")),
      date: todayMMDDYYYY(),
    });
    setPending(false);
    if (!r.ok) return setError(r.error);
    setState({ step: "done", graphId: r.graphId, graphName: r.graphName });
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Connect your graph</h1>
        <p className="text-muted-foreground">
          Link a Roam graph you own to your account. Shared graphs are joined by invite from their owner.
        </p>
      </div>

      {state.step === "form" && (
        <Card>
          <CardHeader>
            <CardTitle>Verify graph ownership</CardTitle>
            <CardDescription>
              We&apos;ll add one block to today&apos;s daily note with your append-only token. If Roam
              accepts it, the graph is yours on roam.pub.
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
                    Used once to add a block to today&apos;s daily note, then discarded. You can delete
                    the token and the block right after.
                  </AlertDescription>
                </Alert>
                <Button type="submit" disabled={pending || !ready}>
                  {pending && <Spinner data-icon="inline-start" />}
                  Verify graph
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      )}

      {state.step === "done" && (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>{state.graphName} is connected</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>
              Get an API key for the Roam Publish extension, then paste it in Roam under Settings → Roam
              Publish. You can delete the block on today&apos;s daily note and the append-only token now.
            </p>
            <KeyReveal graphId={state.graphId} hasKey={false} size="default" />
            <Link href="/dashboard" className={buttonVariants({ variant: "outline", className: "self-start" })}>
              Go to dashboard
            </Link>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
