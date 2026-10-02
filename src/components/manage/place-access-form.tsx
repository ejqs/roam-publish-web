"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateEntry, updateGraphPlace } from "@/app/(app)/dashboard/place-actions";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup, FieldLabel, FieldSeparator, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Access, EntryListing, PlaceAccess, ShowAuthor } from "@/db/schema";
import { ACCESS_DESCRIPTIONS, ACCESS_LABELS, Choice } from "./choice";

export type PlaceState = {
  access: PlaceAccess;
  hasOwnPassword: boolean;
  showAuthor: ShowAuthor;
  /** Entries only. */
  listing?: EntryListing;
};

/**
 * Who can read one place a page appears, its own password, and its byline. The container's
 * default is shown next to "Use default", since a page's own setting replaces it.
 */
export function PlaceAccessForm({
  kind,
  id,
  initial,
  container,
  onSaved,
}: {
  kind: "graph" | "entry";
  /** Publication id for the graph place, entry id for a collection place. */
  id: string;
  initial: PlaceState;
  container: {
    label: string;
    defaultAccess: Access;
    hasPassword: boolean;
    showAuthors: boolean;
    /** Why this collection can't list pages on Discover, if it can't. */
    discoverBlocked?: string;
  };
  onSaved?: () => void;
}) {
  const [state, setState] = useState(initial);
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();
  const effective = state.access === "inherit" ? container.defaultAccess : state.access;
  const needsOwnPassword = effective === "password" && !state.hasOwnPassword && !container.hasPassword;

  function save(extra: { clearPassword?: boolean } = {}) {
    start(async () => {
      const input = {
        access: state.access,
        showAuthor: state.showAuthor,
        ...(password && { password }),
        ...extra,
        ...(kind === "entry" && { listing: state.listing }),
      };
      const res = kind === "graph" ? await updateGraphPlace(id, input) : await updateEntry(id, input);
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message);
      if (password) setState((s) => ({ ...s, hasOwnPassword: true }));
      if (extra.clearPassword) setState((s) => ({ ...s, hasOwnPassword: false }));
      setPassword("");
      onSaved?.();
    });
  }

  const listingOptions = [
    { value: "unlisted" as const, label: "Unlisted", description: "Only people with the link." },
    { value: "listed" as const, label: "Listed", description: `Shown on ${container.label}'s page to everyone who can open it.` },
    {
      value: "discover" as const,
      label: "Discover",
      description: container.discoverBlocked ?? "Also listed on roam.pub/discover.",
      disabled: !!container.discoverBlocked || effective !== "open",
    },
  ];

  return (
    <FieldGroup>
      {kind === "entry" && state.listing && (
        <>
          <FieldSet>
            <FieldLegend variant="label">Listing</FieldLegend>
            <Choice
              id={`listing-${id}`}
              value={state.listing}
              options={listingOptions}
              onChange={(listing) => setState((s) => ({ ...s, listing }))}
            />
            {effective !== "open" && (
              <FieldDescription>Protected pages can be listed (with a lock icon), but never on Discover.</FieldDescription>
            )}
          </FieldSet>
          <FieldSeparator />
        </>
      )}
      <FieldSet>
        <FieldLegend variant="label">Who can read it here</FieldLegend>
        <Choice<PlaceAccess>
          id={`access-${id}`}
          value={state.access}
          onChange={(access) => setState((s) => ({ ...s, access }))}
          options={[
            {
              value: "inherit",
              label: `Use ${container.label}'s default (${ACCESS_LABELS[container.defaultAccess].toLowerCase()})`,
            },
            ...(["open", "password", "members"] as const).map((a) => ({
              value: a,
              label: ACCESS_LABELS[a],
              description:
                a === "open" && container.defaultAccess !== "open"
                  ? "Anyone with the link can read, even though the rest is protected."
                  : ACCESS_DESCRIPTIONS[a],
            })),
          ]}
        />
      </FieldSet>
      {effective === "password" && (
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`password-${id}`}>
            {state.hasOwnPassword ? "Change this page's password" : "Password for this page"}
          </FieldLabel>
          <Input
            id={`password-${id}`}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={state.hasOwnPassword ? "Leave blank to keep it" : container.hasPassword ? `Leave blank to use ${container.label}'s password` : "Required"}
          />
          {state.hasOwnPassword && (
            <Button type="button" variant="link" size="sm" className="self-start px-0" disabled={pending} onClick={() => save({ clearPassword: true })}>
              {container.hasPassword ? `Use ${container.label}'s password instead` : "Remove this page's password"}
            </Button>
          )}
        </div>
      )}
      <FieldSeparator />
      <FieldSet>
        <FieldLegend variant="label">Author byline</FieldLegend>
        <Choice<ShowAuthor>
          id={`author-${id}`}
          value={state.showAuthor}
          onChange={(showAuthor) => setState((s) => ({ ...s, showAuthor }))}
          options={[
            { value: "inherit", label: `Use ${container.label}'s setting (${container.showAuthors ? "shown" : "hidden"})` },
            { value: "show", label: "Show" },
            { value: "hide", label: "Hide" },
          ]}
        />
      </FieldSet>
      <Button type="button" className="self-end" disabled={pending || (needsOwnPassword && !password)} onClick={() => save()}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </FieldGroup>
  );
}
