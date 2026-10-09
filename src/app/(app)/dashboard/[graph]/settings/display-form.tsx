"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ContainerPdfFields } from "@/components/manage/pdf-fields";
import { ContainerViewsFields } from "@/components/manage/views-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet, Field } from "@/components/ui/field";
import type { ViewsMode } from "@/db/schema";
import type { PdfStyle } from "@/lib/pdf";
import { changed, useUnsavedChanges } from "@/lib/unsaved-changes";
import { type GraphDisplay, updateGraphDisplay } from "@/server/actions/dashboard";
import { SettingSwitch } from "./settings-form";

/**
 * How the graph's pages look and where new ones land: bylines, view counts, PDF download,
 * breadcrumbs, the RSS feed and default collections. Who can see them is on the Sharing tab.
 */
export function GraphDisplayForm({
  graphId,
  graphName,
  frontPage,
  indexOpen,
  initial,
  collections,
}: {
  graphId: string;
  graphName: string;
  /** The feed lists the front page, so it needs one anyone can open. */
  frontPage: boolean;
  indexOpen: boolean;
  initial: Omit<GraphDisplay, "views" | "pdfDownload" | "pdfStyle"> & { views: ViewsMode; pdfDownload: boolean; pdfStyle: PdfStyle };
  /** Collections the owner belongs to. */
  collections: { id: string; name: string }[];
}) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof s>(key: K) => (value: (typeof s)[K]) => setS((cur) => ({ ...cur, [key]: value }));
  const norm = (v: typeof s) => ({ ...v, defaultCollections: [...v.defaultCollections].sort() });
  const dirty = changed(norm(s), norm(saved));
  useUnsavedChanges(dirty);
  const defaults = new Set(s.defaultCollections);

  function save() {
    start(async () => {
      const res = await updateGraphDisplay(graphId, s);
      if (!res?.ok) return void toast.error(res?.message ?? "Couldn't save.");
      setSaved(s);
      toast.success(res.message);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display</CardTitle>
        <CardDescription>How pages look to readers. Pages can override bylines, view counts and PDF download.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingSwitch
            id="showAuthors"
            label="Show authors"
            description="Show who wrote each page: the Author name set in the extension, or the publisher's @username."
            checked={s.showAuthors}
            onChange={set("showAuthors")}
          />
          <FieldSeparator />
          <ContainerViewsFields
            kind="graph"
            views={s.views}
            countries={s.showViewCountries}
            onChange={(v) => setS((cur) => ({ ...cur, views: v.views, showViewCountries: v.countries }))}
          />
          <FieldSeparator />
          <ContainerPdfFields
            kind="graph"
            enabled={s.pdfDownload}
            style={s.pdfStyle}
            onChange={(v) => setS((cur) => ({ ...cur, pdfDownload: v.enabled, pdfStyle: v.style }))}
          />
          <FieldSeparator />
          <SettingSwitch
            id="showOwner"
            label="Link to your profile"
            description="Show your @username in breadcrumbs. Only while your profile is public."
            checked={s.showOwner}
            onChange={set("showOwner")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="hideUnlistedBreadcrumbs"
            label="Hide breadcrumbs on Unlisted pages"
            description="Unlisted pages won't link back to this graph or your profile."
            checked={s.hideUnlistedBreadcrumbs}
            onChange={set("hideUnlistedBreadcrumbs")}
          />
          <FieldSeparator />
          <SettingSwitch
            id="rss"
            label="RSS feed"
            description={
              !frontPage
                ? "Turn on the front page in Sharing to offer an RSS feed."
                : !indexOpen
                  ? "Not available while the front page is locked."
                  : `A feed at roam.pub/${graphName}/feed.xml with pages open to everyone.`
            }
            checked={s.rss && frontPage && indexOpen}
            disabled={!frontPage || !indexOpen}
            onChange={set("rss")}
          />
          <FieldSeparator />
          <FieldSet>
            <FieldLegend variant="label">New pages go to</FieldLegend>
            <FieldDescription>
              Where a page lands when it&apos;s first published from Roam. Collections only apply when the publisher
              belongs to them; a page that would land nowhere stays in the graph.
            </FieldDescription>
            <Field orientation="horizontal">
              <Checkbox id="newPagesInGraph" checked={s.newPagesInGraph} onCheckedChange={(v) => set("newPagesInGraph")(!!v)} />
              <FieldLabel htmlFor="newPagesInGraph" className="font-normal">
                This graph ({graphName})
              </FieldLabel>
            </Field>
            {collections.map((c) => (
              <Field key={c.id} orientation="horizontal">
                <Checkbox
                  id={`default-${c.id}`}
                  checked={defaults.has(c.id)}
                  onCheckedChange={(v) =>
                    set("defaultCollections")(v ? [...defaults, c.id] : [...defaults].filter((id) => id !== c.id))
                  }
                />
                <FieldLabel htmlFor={`default-${c.id}`} className="font-normal">
                  Collection: {c.name}
                </FieldLabel>
              </Field>
            ))}
          </FieldSet>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end gap-3">
        {dirty && !pending && <p className="text-xs text-muted-foreground">Unsaved changes</p>}
        <Button onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}
