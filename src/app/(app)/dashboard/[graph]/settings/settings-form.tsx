"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DESCRIPTION_MAX } from "@/lib/descriptions";
import { type GraphSettings, updateGraphSettings } from "../../actions";

export function GraphSettingsForm({
  graphId,
  graphName,
  indexOpen,
  defaultsHref,
  initial,
}: {
  graphId: string;
  graphName: string;
  /** Anyone can open the front page; feeds only list open graphs. */
  indexOpen: boolean;
  /** The Defaults tab, where who can open the front page is set. */
  defaultsHref: string;
  initial: GraphSettings;
}) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (key: Exclude<keyof GraphSettings, "description">) => (value: boolean) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const normalize = (s: GraphSettings): GraphSettings => ({
    ...s,
    featured: s.featured && s.frontPage,
    rss: s.rss && s.frontPage,
    description: s.description.replace(/\s+/g, " ").trim(),
  });
  const current = normalize(settings);
  const dirty = (Object.keys(current) as (keyof GraphSettings)[]).some((k) => current[k] !== saved[k]);

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
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="description">Description</FieldLabel>
            <Textarea
              id="description"
              rows={2}
              maxLength={DESCRIPTION_MAX}
              value={settings.description}
              onChange={(e) => setSettings((s) => ({ ...s, description: e.target.value }))}
              placeholder="What's in this graph?"
            />
            <div className="flex items-start justify-between gap-2">
              <FieldDescription>Shown under the title on the front page. Plain text.</FieldDescription>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {settings.description.length}/{DESCRIPTION_MAX}
              </span>
            </div>
          </Field>
          <FieldSeparator />
          <SettingSwitch
            id="frontPage"
            label="Front page"
            description={`An index of your public pages at roam.pub/${graphName}.`}
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
            id="featured"
            label="List new pages on Discover"
            description={
              !settings.frontPage
                ? "Turn on the front page to list this graph's pages on Discover."
                : !settings.indexable
                  ? "Turn on search engines to list this graph's pages on Discover."
                  : "New public pages start out on roam.pub/discover. Existing pages keep their own setting."
            }
            checked={settings.featured && settings.frontPage}
            disabled={!settings.frontPage || !settings.indexable}
            onChange={set("featured")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="rss"
            label="RSS feed"
            description={
              !settings.frontPage
                ? "Turn on the front page to offer an RSS feed."
                : !indexOpen
                  ? (
                      <>
                        The feed only works while anyone can open the front page. Change that in{" "}
                        <Link href={defaultsHref} className="underline">
                          Defaults
                        </Link>
                        .
                      </>
                    )
                  : `A feed at roam.pub/${graphName}/feed.xml with pages open to everyone.`
            }
            checked={settings.rss && settings.frontPage}
            disabled={!settings.frontPage}
            onChange={set("rss")}
          />
          <FieldSeparator />
          <details>
            <summary className="cursor-pointer text-sm font-medium select-none">Breadcrumbs</summary>
            <FieldGroup className="mt-4">
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
            label="Hide breadcrumbs on pages that aren't listed"
            description="Unlisted pages won't link back to this graph or your profile."
            checked={settings.hideUnlistedBreadcrumbs}
            onChange={set("hideUnlistedBreadcrumbs")}
          />
            </FieldGroup>
          </details>
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
