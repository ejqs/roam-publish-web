"use client";

import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { OPTIONAL_CATEGORIES } from "@/lib/changelog-categories";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { removeAppendToken, setAppendToken, setChangeLogOn, setChangeLogOptions } from "./change-log-actions";

type Options = { off: string[]; merge: boolean; byDay: boolean };

function todayMMDDYYYY() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}-${d.getFullYear()}`;
}

/** Owner-only: the append-only token the change log under each page's status link is written with. */
export function ChangeLogForm({
  graphId,
  status,
  paused,
  options: initialOptions,
  addedAt,
}: {
  graphId: string;
  status: "ok" | "invalid" | null;
  /** Turned off, here or from the extension; the token is kept. */
  paused: boolean;
  /** What goes into the change log; see `setChangeLogOptions`. */
  options: Options;
  addedAt: string | null;
}) {
  const [token, setToken] = useState("");
  const [options, setOptions] = useState(initialOptions);
  const [pending, startTransition] = useTransition();
  // The token field is the only part that waits for Save; the switches save when changed.
  useUnsavedChanges(status !== "ok" && !!token.trim());

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

  function toggle(on: boolean) {
    startTransition(async () => {
      const res = await setChangeLogOn(graphId, on);
      if (!res?.ok) return void toast.error(res?.message ?? "Couldn't change the change log.");
      toast.success(res.message);
    });
  }

  function change(next: Partial<Options>) {
    const before = options;
    const updated = { ...options, ...next };
    setOptions(updated);
    startTransition(async () => {
      const res = await setChangeLogOptions(graphId, updated);
      if (res?.ok) return;
      setOptions(before);
      toast.error(res?.message ?? "Couldn't save the change log options.");
    });
  }

  function remove() {
    if (!confirm("Remove the token? roam.pub stops writing the change log in Roam, and you'd need a new append-only token from Roam to turn it back on."))
      return;
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
          The extension adds a Roam Publish Status link to each page it publishes. With an append-only token,
          roam.pub adds a dated entry under it whenever the page is published, changed, moved between collections or
          unpublished, including changes made here on the website. Each page&apos;s history is also on its status
          page, with or without a token.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status !== null && (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="change-log-on">Write the change log</FieldLabel>
              <FieldDescription>
                Off keeps the token but adds nothing to Roam; changes made meanwhile aren&apos;t logged.
              </FieldDescription>
            </FieldContent>
            <Switch id="change-log-on" checked={!paused} disabled={pending} onCheckedChange={toggle} />
          </Field>
        )}
        {status !== null && !paused && (
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">What to log in Roam</FieldLegend>
              <FieldDescription>
                Left out changes still show in each page&apos;s history on its status page. Moderation is always
                logged.
              </FieldDescription>
              {OPTIONAL_CATEGORIES.map((c) => (
                <Field key={c.id} orientation="horizontal">
                  <Checkbox
                    id={`change-log-${c.id}`}
                    checked={!options.off.includes(c.id)}
                    disabled={pending}
                    onCheckedChange={(on) =>
                      change({ off: on ? options.off.filter((o) => o !== c.id) : [...options.off, c.id] })
                    }
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={`change-log-${c.id}`}>{c.label}</FieldLabel>
                    <FieldDescription>{c.description}</FieldDescription>
                  </FieldContent>
                </Field>
              ))}
            </FieldSet>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="change-log-merge">Merge quick changes</FieldLabel>
                <FieldDescription>
                  Changes to a setting made within 5 minutes of each other are logged once, with where it ended
                  up. Entries then reach Roam about 5 minutes after the last change instead of 30 seconds.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="change-log-merge"
                checked={options.merge}
                disabled={pending}
                onCheckedChange={(merge) => change({ merge })}
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="change-log-by-day">Group by day</FieldLabel>
                <FieldDescription>
                  Entries go under one [[date]] block per day. Off puts the date on every entry.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="change-log-by-day"
                checked={options.byDay}
                disabled={pending}
                onCheckedChange={(byDay) => change({ byDay })}
              />
            </Field>
          </FieldGroup>
        )}
        {status === "ok" && !paused && (
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
              it reliably, please let me know at support@roam.pub.
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
