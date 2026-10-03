"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ContainerAccessFields, type ContainerAccess } from "@/components/manage/container-access-fields";
import { ContainerViewsFields } from "@/components/manage/views-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Access, ViewsMode } from "@/db/schema";
import { DESCRIPTION_MAX } from "@/lib/descriptions";
import { deleteCollection, updateCollection } from "../../actions";

type Initial = {
  name: string;
  description: string;
  indexAccess: Access;
  defaultAccess: Access;
  showAuthors: boolean;
  views: ViewsMode;
  showViewCountries: boolean;
  indexable: boolean;
  featured: boolean;
  discoverable: boolean;
  rss: boolean;
};

export function CollectionSettingsForm({
  collectionId,
  slug,
  initial,
  hasPassword: initialHasPassword,
  pageCount,
}: {
  collectionId: string;
  slug: string;
  initial: Initial;
  hasPassword: boolean;
  pageCount: number;
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [access, setAccess] = useState<ContainerAccess>({
    indexAccess: initial.indexAccess,
    defaultAccess: initial.defaultAccess,
    password: "",
    clearPassword: false,
  });
  const [hasPassword, setHasPassword] = useState(initialHasPassword);
  const [pending, start] = useTransition();
  const discoverOk = access.indexAccess === "open" && s.indexable;
  const set = <K extends keyof Initial>(k: K) => (v: Initial[K]) => setS((p) => ({ ...p, [k]: v }));

  function save() {
    start(async () => {
      const res = await updateCollection(collectionId, { ...s, ...access });
      if (!res.ok) return void toast.error(res.message);
      if (access.password) setHasPassword(true);
      if (access.clearPassword) setHasPassword(false);
      setAccess((a) => ({ ...a, password: "", clearPassword: false }));
      toast.success(res.message);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="c-name">Name</FieldLabel>
            <Input id="c-name" value={s.name} onChange={(e) => set("name")(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="c-description">Description</FieldLabel>
            <Textarea
              id="c-description"
              rows={2}
              maxLength={DESCRIPTION_MAX}
              value={s.description}
              onChange={(e) => set("description")(e.target.value)}
            />
          </Field>
          <FieldSeparator />
          <ContainerAccessFields
            kind="collection"
            label={initial.name}
            containerId={collectionId}
            pageCount={pageCount}
            value={access}
            hasPassword={hasPassword}
            onChange={setAccess}
          />
          <FieldSeparator />
          <Toggle id="c-authors" label="Show authors" description="Bylines on pages in this collection. Pages can override it." checked={s.showAuthors} onChange={set("showAuthors")} />
          <FieldSeparator />
          <ContainerViewsFields
            kind="collection"
            views={s.views}
            countries={s.showViewCountries}
            onChange={(v) => setS((p) => ({ ...p, views: v.views, showViewCountries: v.countries }))}
          />
          <FieldSeparator />
          <Toggle
            id="c-indexable"
            label="Search engines"
            description="Let search engines index the collection page and its open, listed pages."
            checked={s.indexable}
            onChange={set("indexable")}
          />
          <FieldSeparator />
          <Toggle
            id="c-discoverable"
            label="List this collection on Discover"
            description={discoverOk ? "Show the collection on roam.pub/discover." : "Only open, indexable collections can be listed on Discover."}
            checked={s.discoverable && discoverOk}
            disabled={!discoverOk}
            onChange={set("discoverable")}
          />
          <FieldSeparator />
          <Toggle
            id="c-featured"
            label="List new pages on Discover"
            description={
              discoverOk && access.defaultAccess === "open"
                ? "Pages added from now on start out on Discover. Existing pages keep their own setting."
                : "Only open pages in an open, indexable collection can go on Discover."
            }
            checked={s.featured && discoverOk && access.defaultAccess === "open"}
            disabled={!discoverOk || access.defaultAccess !== "open"}
            onChange={set("featured")}
          />
          <FieldSeparator />
          <Toggle
            id="c-rss"
            label="RSS feed"
            description={
              access.indexAccess === "open"
                ? `Offer a feed at roam.pub/c/${slug}/feed.xml. Only open, listed pages are included.`
                : "The feed only works while anyone can open the collection page."
            }
            checked={s.rss}
            onChange={set("rss")}
          />
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-between">
        <Button
          variant="ghost"
          className="text-destructive"
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete this collection? Its page links stop working. The pages stay published in their graphs.")) return;
            start(async () => {
              const res = await deleteCollection(collectionId);
              if (!res.ok) return void toast.error(res.message);
              router.push("/dashboard");
            });
          }}
        >
          Delete collection
        </Button>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Toggle({
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
