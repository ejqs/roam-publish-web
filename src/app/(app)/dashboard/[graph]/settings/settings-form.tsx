"use client";

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
import { type GraphSettings, updateGraphSettings } from "../../actions";

export function GraphSettingsForm({
  graphId,
  graphName,
  initial,
}: {
  graphId: string;
  graphName: string;
  initial: GraphSettings;
}) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof GraphSettings) => (value: boolean) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const dirty = (Object.keys(settings) as (keyof GraphSettings)[]).some((k) => settings[k] !== saved[k]);

  function save() {
    startTransition(async () => {
      const res = await updateGraphSettings(graphId, settings);
      if (!res?.ok) return void toast.error(res?.message ?? "Couldn't save settings.");
      const next = { ...settings, featured: settings.featured && settings.frontPage };
      setSettings(next);
      setSaved(next);
      toast.success(res.message);
    });
  }

  return (
    <Card>
      <CardContent>
        <FieldGroup>
          <SettingSwitch
            id="frontPage"
            label="Front page"
            description={`Show an index of your public pages at roam.pub/${graphName}.`}
            checked={settings.frontPage}
            onChange={set("frontPage")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="indexable"
            label="Search engines"
            description="Allow search engines to index your front page and public pages. Unlisted pages are never indexed."
            checked={settings.indexable}
            onChange={set("indexable")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="featured"
            label="Feature on roam.pub"
            description={
              settings.frontPage
                ? "List this graph and its recent public pages on the roam.pub home page."
                : "Turn on the front page to feature this graph."
            }
            checked={settings.featured && settings.frontPage}
            disabled={!settings.frontPage}
            onChange={set("featured")}
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
  description: string;
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
