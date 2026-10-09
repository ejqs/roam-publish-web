"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DESCRIPTION_MAX } from "@/lib/descriptions";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { type GraphSettings, updateGraphSettings } from "@/server/actions/dashboard";

export function GraphSettingsForm({ graphId, initial }: { graphId: string; initial: { description: string } }) {
  const [description, setDescription] = useState(initial.description);
  const [saved, setSaved] = useState(initial.description);
  const [pending, startTransition] = useTransition();
  const current = description.replace(/\s+/g, " ").trim();
  const dirty = current !== saved;
  useUnsavedChanges(dirty);

  function save() {
    startTransition(async () => {
      const res = await updateGraphSettings(graphId, { description });
      if (!res?.ok) return void toast.error(res?.message ?? "Couldn't save settings.");
      setDescription(current);
      setSaved(current);
      toast.success(res.message);
    });
  }

  return (
    <Card>
      <CardContent>
        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea
            id="description"
            rows={2}
            maxLength={DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's in this graph?"
          />
          <div className="flex items-start justify-between gap-2">
            <FieldDescription>Shown under the title on the front page. Plain text.</FieldDescription>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {description.length}/{DESCRIPTION_MAX}
            </span>
          </div>
        </Field>
      </CardContent>
      <CardFooter className="justify-end gap-3">
        {dirty && !pending && <p className="text-xs text-muted-foreground">Unsaved changes</p>}
        <Button onClick={save} disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}

type Listing = Pick<GraphSettings, "frontPage" | "indexable" | "searchListed">;

/** On the Sharing tab: where Public pages show up (the front page, search engines, site search). */
export function GraphListingForm({
  graphId,
  graphName,
  indexOpen,
  initial,
  pinned,
}: {
  graphId: string;
  graphName: string;
  /** Anyone can open the front page; feeds only list open graphs. */
  indexOpen: boolean;
  initial: Listing;
  /** Why the front page can't be turned off: its link is pinned. */
  pinned?: string;
}) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Listing) => (value: boolean) => setSettings((s) => ({ ...s, [key]: value }));
  const current = settings;
  const dirty = (Object.keys(current) as (keyof Listing)[]).some((k) => current[k] !== saved[k]);
  useUnsavedChanges(dirty);

  function save() {
    startTransition(async () => {
      const res = await updateGraphSettings(graphId, settings);
      if (!res?.ok) return void toast.error(res?.message ?? "Couldn't save settings.");
      setSettings(current);
      setSaved(current);
      toast.success(res.message);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where Public pages show up</CardTitle>
        <CardDescription>Unlisted, Password and Members pages are never indexed or in search.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingSwitch
            id="frontPage"
            label="Front page"
            description={
              pinned && saved.frontPage ? pinned : `An index of your Public and Discover pages at roam.pub/${graphName}.`
            }
            disabled={!!pinned && saved.frontPage}
            checked={settings.frontPage}
            onChange={set("frontPage")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="indexable"
            label="Search engines"
            description={
              !indexOpen
                ? "Not available while the front page is locked."
                : "Let search engines index your front page and Public pages."
            }
            checked={settings.indexable && indexOpen}
            disabled={!indexOpen}
            onChange={set("indexable")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="searchListed"
            label="Public pages in roam.pub search"
            description={
              !indexOpen
                ? "Not available while the front page is locked."
                : "Find your Public pages from roam.pub/search. Pages on Discover are always searchable."
            }
            checked={settings.searchListed && indexOpen}
            disabled={!indexOpen}
            onChange={set("searchListed")}
          />
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end gap-3">
        {dirty && !pending && <p className="text-xs text-muted-foreground">Unsaved changes</p>}
        <Button onClick={save} disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function SettingSwitch({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v)} />
    </Field>
  );
}
