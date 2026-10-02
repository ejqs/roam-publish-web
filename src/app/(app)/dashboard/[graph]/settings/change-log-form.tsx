"use client";

import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { removeAppendToken, setAppendToken } from "./change-log-actions";

function todayMMDDYYYY() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}-${d.getFullYear()}`;
}

/** Owner-only: the append-only token the change log under each page's shortlink block is written with. */
export function ChangeLogForm({
  graphId,
  status,
  addedAt,
}: {
  graphId: string;
  status: "ok" | "invalid" | null;
  addedAt: string | null;
}) {
  const [token, setToken] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await setAppendToken(graphId, {
        token,
        date: todayMMDDYYYY(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!res?.ok) return void toast.error(res?.message ?? "Couldn't save the token.");
      setToken("");
      toast.success(res.message);
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeAppendToken(graphId);
      if (!res?.ok) return void toast.error(res?.message ?? "Couldn't remove the token.");
      toast.success(res.message);
    });
  }

  return (
    <Card id="change-log">
      <CardHeader>
        <CardTitle>Roam change log</CardTitle>
        <CardDescription>
          The extension adds a shortlink block to each page it publishes. With an append-only token, roam.pub adds a
          dated entry under that block whenever the page is published, changed, moved between collections or
          unpublished, including changes made here on the website.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === "ok" && (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>Change log is on</AlertTitle>
            <AlertDescription>
              Token stored encrypted{addedAt ? ` since ${new Date(addedAt).toLocaleDateString()}` : ""}. It can only
              append blocks.
            </AlertDescription>
          </Alert>
        )}
        {status === "invalid" && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>Roam rejected the stored token</AlertTitle>
            <AlertDescription>It was revoked or replaced in Roam. Add a new append-only token below.</AlertDescription>
          </Alert>
        )}
        {status !== "ok" && (
          <Field>
            <FieldLabel htmlFor="append-token">Append-only API token</FieldLabel>
            <Input
              id="append-token"
              type="password"
              placeholder="roam-graph-token-…"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <FieldDescription>
              In Roam: Settings → Graph → API tokens → New API token, with <strong>append-only access</strong>. We
              check it by adding one block to today&apos;s daily note. Roam also creates an{" "}
              <code>[[API Token: …]]</code> page for the token, which may not be deletable. If you know how to remove
              it reliably, please let me know at ejqs [at] ejqs [dot] net.
            </FieldDescription>
          </Field>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        {status !== null && (
          <Button variant="outline" onClick={remove} disabled={pending}>
            Remove token
          </Button>
        )}
        {status !== "ok" && (
          <Button onClick={save} disabled={pending || !token.trim()}>
            Save token
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
