"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Ask = { title: string; description: string; label: string };

/**
 * Asks for a password in a dialog and resolves with it, or null when cancelled. For changes to an
 * encrypted page that need one of its passwords: `run` tries the change, and when the server says
 * it needs the current password, asks and tries again with it until it works or is cancelled.
 */
export function usePasswordPrompt() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [error, setError] = useState("");
  const [value, setValue] = useState("");
  const resolve = useRef<((v: string | null) => void) | null>(null);

  function prompt(a: Ask, err = ""): Promise<string | null> {
    setAsk(a);
    setError(err);
    setValue("");
    return new Promise((r) => (resolve.current = r));
  }

  function finish(v: string | null) {
    resolve.current?.(v);
    resolve.current = null;
    setAsk(null);
  }

  /** Runs `fn`, asking for the current password and retrying while the server needs it. */
  async function run<R extends { ok: boolean; message: string; needCurrentPassword?: boolean } | null>(
    fn: (currentPassword?: string) => Promise<R>,
    a: Ask = {
      title: "Enter the current password",
      description: "This page is encrypted, so this change needs a password that opens it now.",
      label: "Current password",
    },
  ): Promise<R | null> {
    let res = await fn();
    let tried = false;
    while (res && !res.ok && res.needCurrentPassword) {
      const pw = await prompt(a, tried ? res.message : "");
      if (pw === null) return null;
      tried = true;
      res = await fn(pw);
    }
    return res;
  }

  const element = (
    <Dialog open={!!ask} onOpenChange={(o) => !o && finish(null)}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (value) finish(value);
          }}
        >
          <DialogHeader>
            <DialogTitle>{ask?.title}</DialogTitle>
            <DialogDescription>{ask?.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password-prompt" className="text-sm font-medium">
              {ask?.label}
            </label>
            <Input
              id="password-prompt"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={value}
              aria-invalid={!!error}
              onChange={(e) => setValue(e.target.value)}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">Not asked again once you&apos;ve unlocked the page in this browser.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value}>
              Continue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { element, prompt, run };
}
