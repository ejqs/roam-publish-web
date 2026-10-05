"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DESCRIPTION_MAX } from "@/lib/descriptions";
import { type GraphSettings, updateGraphSettings } from "../../actions";

export function GraphSettingsForm({ graphId, initial }: { graphId: string; initial: { description: string } }) {
  const [description, setDescription] = useState(initial.description);
  const [saved, setSaved] = useState(initial.description);
  const [pending, startTransition] = useTransition();
  const current = description.replace(/\s+/g, " ").trim();

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
      <CardFooter className="justify-end">
        <Button onClick={save} disabled={current === saved || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}

type Listing = Omit<GraphSettings, "description">;

/** On the Sharing tab: the front page, search engines, site search, RSS and breadcrumbs. */
export function GraphListingForm({
  graphId,
  graphName,
  indexOpen,
  indexPassword,
  initial,
}: {
  graphId: string;
  graphName: string;
  /** Anyone can open the front page; feeds only list open graphs. */
  indexOpen: boolean;
  /** The front page needs a password, so its pages stay out of site search. */
  indexPassword: boolean;
  initial: Listing;
}) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Listing) => (value: boolean) => setSettings((s) => ({ ...s, [key]: value }));
  const normalize = (s: Listing): Listing => ({ ...s, rss: s.rss && s.frontPage });
  const current = normalize(settings);
  const dirty = (Object.keys(current) as (keyof Listing)[]).some((k) => current[k] !== saved[k]);

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
        <CardTitle>Listing</CardTitle>
        <CardDescription>Where this graph&apos;s listed pages show up.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingSwitch
            id="frontPage"
            label="Front page"
            description={`An index of your listed pages at roam.pub/${graphName}.`}
            checked={settings.frontPage}
            onChange={set("frontPage")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="indexable"
            label="Search engines"
            description="Let search engines index your front page and listed pages. Unlisted pages are never indexed."
            checked={settings.indexable}
            onChange={set("indexable")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="searchListed"
            label="Listed pages in site search"
            description={
              indexPassword
                ? "Not available while the front page needs a password."
                : "Find your listed pages from roam.pub/search. Discoverable pages are always searchable."
            }
            checked={settings.searchListed && !indexPassword}
            disabled={indexPassword}
            onChange={set("searchListed")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="rss"
            label="RSS feed"
            description={
              !settings.frontPage
                ? "Turn on the front page to offer an RSS feed."
                : !indexOpen
                  ? "The feed only works while anyone can open the front page. Change that above."
                  : `A feed at roam.pub/${graphName}/feed.xml with pages open to everyone.`
            }
            checked={settings.rss && settings.frontPage}
            disabled={!settings.frontPage}
            onChange={set("rss")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="showOwner"
            label="Link to your profile"
            description="Show your @username in breadcrumbs. Only while your profile is public."
            checked={settings.showOwner}
            onChange={set("showOwner")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="hideUnlistedBreadcrumbs"
            label="Hide breadcrumbs on unlisted pages"
            description="Unlisted pages won't link back to this graph or your profile."
            checked={settings.hideUnlistedBreadcrumbs}
            onChange={set("hideUnlistedBreadcrumbs")}
          />
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={save} disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function SettingSwitch({
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
