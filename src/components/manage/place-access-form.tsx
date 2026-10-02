"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateEntry, updateGraphPlace } from "@/app/(app)/dashboard/place-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EntryListing, PlaceAccess, ShowAuthor } from "@/db/schema";

export type PlaceState = {
  access: PlaceAccess;
  hasOwnPassword: boolean;
  showAuthor: ShowAuthor;
  /** Entries only. */
  listing?: EntryListing;
};

/**
 * Changes or removes one password-protected place's own password, which replaces its graph's or
 * collection's. The AccessMenu asks for the first one when Password is chosen.
 */
export function PlacePasswordForm({
  kind,
  id,
  hasOwnPassword,
  container,
  onSaved,
}: {
  kind: "graph" | "entry";
  /** Publication id for the graph place, entry id for a collection place. */
  id: string;
  hasOwnPassword: boolean;
  container: { label: string; hasPassword: boolean };
  onSaved?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  function save(input: { password?: string; clearPassword?: boolean }) {
    start(async () => {
      const res = kind === "graph" ? await updateGraphPlace(id, input) : await updateEntry(id, input);
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message || "Saved.");
      setPassword("");
      onSaved?.();
    });
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (password) save({ password });
      }}
    >
      <div className="flex gap-2">
        <Input
          type="password"
          autoComplete="new-password"
          aria-label={hasOwnPassword ? "New password for this page" : "Password for this page"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={hasOwnPassword ? "New password for this page" : "Password for this page"}
          className="h-8"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending || !password}>
          {hasOwnPassword ? "Change" : "Set"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {hasOwnPassword ? "This page has its own password. " : `Uses ${container.label}'s password unless you set one here. `}
        {hasOwnPassword && (
          <button
            type="button"
            disabled={pending}
            onClick={() => save({ clearPassword: true })}
            className="text-link hover:underline disabled:opacity-50"
          >
            {container.hasPassword ? `Use ${container.label}'s instead` : "Remove it"}
          </button>
        )}
      </p>
    </form>
  );
}
