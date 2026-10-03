"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateEntry, updateGraphPlace } from "@/app/(app)/dashboard/place-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EntryListing, PlaceAccess, PlaceViews, ShowAuthor } from "@/db/schema";
import { ENCRYPT_PASSWORD_MIN } from "@/lib/encryption-rules";
import { usePasswordPrompt } from "./password-prompt";

export type PlaceState = {
  access: PlaceAccess;
  hasOwnPassword: boolean;
  showAuthor: ShowAuthor;
  views: PlaceViews;
  showViewCountries: ShowAuthor;
  /** Entries only. */
  listing?: EntryListing;
  /** The page is encrypted: it can only use Password here, and password changes need the current one. */
  encrypted?: boolean;
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
  encrypted,
  onSaved,
}: {
  kind: "graph" | "entry";
  /** Publication id for the graph place, entry id for a collection place. */
  id: string;
  hasOwnPassword: boolean;
  container: { label: string; hasPassword: boolean };
  /** The page is encrypted: a new password needs 10+ characters, and the current one to switch. */
  encrypted?: boolean;
  onSaved?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();
  const passwordPrompt = usePasswordPrompt();

  function save(input: { password?: string; clearPassword?: boolean }) {
    start(async () => {
      const res = await passwordPrompt.run((currentPassword) =>
        kind === "graph" ? updateGraphPlace(id, { ...input, currentPassword }) : updateEntry(id, { ...input, currentPassword }),
      );
      if (!res) return;
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
      {passwordPrompt.element}
      <p className="text-xs text-muted-foreground">
        {encrypted && `At least ${ENCRYPT_PASSWORD_MIN} characters, because this page is encrypted. `}
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
