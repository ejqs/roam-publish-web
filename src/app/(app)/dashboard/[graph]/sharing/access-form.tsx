"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ContainerAccessFields, type ContainerAccess } from "@/components/manage/container-access-fields";
import { ContainerViewsFields } from "@/components/manage/views-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { Access, ViewsMode } from "@/db/schema";
import { updateGraphAccess } from "../../actions";

/** Defaults for every page in the graph: access, bylines, view counts, and where new pages go. */
export function GraphAccessForm({
  graphId,
  graphName,
  pageCount,
  initial,
  collections,
  encryptedPages,
}: {
  graphId: string;
  graphName: string;
  pageCount: number;
  /** Titles of encrypted pages that open with the graph password. */
  encryptedPages: string[];
  initial: {
    indexAccess: Access;
    defaultAccess: Access;
    hasPassword: boolean;
    showAuthors: boolean;
    views: ViewsMode;
    showViewCountries: boolean;
    newPagesInGraph: boolean;
    encryptNewPages: boolean;
    defaultCollections: string[];
  };
  /** Collections the owner belongs to. */
  collections: { id: string; name: string }[];
}) {
  const [access, setAccess] = useState<ContainerAccess>({
    indexAccess: initial.indexAccess,
    defaultAccess: initial.defaultAccess,
    encryptNewPages: initial.encryptNewPages,
    password: "",
    clearPassword: false,
  });
  const [hasPassword, setHasPassword] = useState(initial.hasPassword);
  const [showAuthors, setShowAuthors] = useState(initial.showAuthors);
  const [views, setViews] = useState({ views: initial.views, countries: initial.showViewCountries });
  const [newPagesInGraph, setNewPagesInGraph] = useState(initial.newPagesInGraph);
  const [defaults, setDefaults] = useState(new Set(initial.defaultCollections));
  const router = useRouter();
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateGraphAccess(graphId, {
        ...access,
        showAuthors,
        views: views.views,
        showViewCountries: views.countries,
        newPagesInGraph,
        defaultCollections: [...defaults],
      });
      if (!res?.ok) return void toast.error(res?.message ?? "Couldn't save.");
      if (access.password) setHasPassword(true);
      if (access.clearPassword) setHasPassword(false);
      setAccess((a) => ({ ...a, password: "", clearPassword: false, currentPassword: "", resetEncrypted: false }));
      toast.success(res.message);
      // The Listing card below reads the saved front page access.
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent>
        <FieldGroup>
          <ContainerAccessFields
            kind="graph"
            label={graphName}
            containerId={graphId}
            pageCount={pageCount}
            value={access}
            hasPassword={hasPassword}
            encryptedPages={encryptedPages}
            onChange={setAccess}
          />
          <FieldSeparator />
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="showAuthors">Show authors</FieldLabel>
              <FieldDescription>
                Show who wrote each page: the Author name set in the extension, or the publisher&apos;s @username.
                Pages can override this.
              </FieldDescription>
            </FieldContent>
            <Switch id="showAuthors" checked={showAuthors} onCheckedChange={setShowAuthors} />
          </Field>
          <FieldSeparator />
          <ContainerViewsFields kind="graph" views={views.views} countries={views.countries} onChange={setViews} />
          <FieldSeparator />
          <FieldSet>
            <FieldLegend variant="label">New pages go to</FieldLegend>
            <FieldDescription>
              Where a page lands when it&apos;s first published from Roam. Collections only apply when the publisher
              belongs to them; a page that would land nowhere stays in the graph.
            </FieldDescription>
            <Field orientation="horizontal">
              <Checkbox id="newPagesInGraph" checked={newPagesInGraph} onCheckedChange={(v) => setNewPagesInGraph(!!v)} />
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
                    setDefaults((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(c.id);
                      else next.delete(c.id);
                      return next;
                    })
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
      <CardFooter className="justify-end">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}
