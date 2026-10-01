"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type ActionState, adminClearUsername, adminReleaseAlias, adminRenameUsername } from "../actions";

/** Inline rename (old name becomes a redirect) and clear (for abusive names). */
export function UsernameControls({ userId, username }: { userId: string; username: string }) {
  const [editing, setEditing] = useState(false);
  const [state, rename, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const res = await adminRenameUsername(userId, prev, formData);
    if (res?.ok) {
      toast.success(res.message);
      setEditing(false);
    }
    return res;
  }, null);
  const [clearing, startClear] = useTransition();

  if (!editing) {
    return (
      <div className="mt-1 flex gap-1">
        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setEditing(true)}>
          Rename
        </Button>
        <span className="text-muted-foreground">·</span>
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0 text-destructive"
          disabled={clearing}
          onClick={() => {
            if (!confirm(`Clear @${username}? The name stays reserved and /u/${username} will 404.`)) return;
            startClear(async () => {
              const res = await adminClearUsername(userId);
              if (res) (res.ok ? toast.success : toast.error)(res.message);
            });
          }}
        >
          Clear
        </Button>
      </div>
    );
  }

  return (
    <form action={rename} className="mt-1 flex flex-col gap-1">
      <div className="flex gap-1">
        <Input name="username" defaultValue={username} aria-label="New username" className="h-7 w-40" autoFocus />
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {state && !state.ok && <FieldError>{state.message}</FieldError>}
    </form>
  );
}

/** Former names, each releasable when nothing links to it any more. */
export function FormerUsernames({ names }: { names: string[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      formerly
      {names.map((n) => (
        <span key={n} className="inline-flex items-center">
          @{n}
          <button
            type="button"
            disabled={pending}
            aria-label={`Release @${n}`}
            title={`Release @${n}`}
            className="ml-0.5 rounded-sm px-0.5 hover:bg-muted hover:text-destructive disabled:opacity-50"
            onClick={() => {
              if (!confirm(`Release @${n}? /u/${n} will stop redirecting and anyone can claim the name.`)) return;
              start(async () => {
                const res = await adminReleaseAlias(n);
                if (res) (res.ok ? toast.success : toast.error)(res.message);
              });
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
