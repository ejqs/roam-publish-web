"use client";

import { KeyRoundIcon, XIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** How long after connecting a graph the reminder shows. */
const REVOKE_REMINDER_MS = 24 * 60 * 60 * 1000;

type Connected = { id: string; name: string; verifiedAt: string };

// Keyed by verification time too, so reconnecting with a new token reminds again.
const storageKey = (g: Connected) => `rp:revoke-token-dismissed:${g.id}:${g.verifiedAt}`;

// Same-tab dismissals don't fire "storage", so notify subscribers directly.
const listeners = new Set<() => void>();
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function isDismissed(g: Connected) {
  try {
    return !!localStorage.getItem(storageKey(g));
  } catch {
    return false;
  }
}

/**
 * Reminds owners to revoke the append-only token they connected a graph with, which roam.pub never
 * stores. Shows for a day after verifying, until dismissed in this browser.
 */
export function RevokeTokenReminder({ graphs }: { graphs: Connected[] }) {
  // Ids of graphs still due a reminder, as a string so the snapshot compares by value. Empty on the
  // server so a dismissed reminder never flashes before hydration.
  const due = useSyncExternalStore(
    subscribe,
    () =>
      graphs
        .filter((g) => Date.now() - new Date(g.verifiedAt).getTime() < REVOKE_REMINDER_MS && !isDismissed(g))
        .map((g) => g.id)
        .join(","),
    () => "",
  );
  const visible = graphs.filter((g) => due.split(",").includes(g.id));
  if (visible.length === 0) return null;

  const dismiss = () => {
    for (const g of visible) {
      try {
        localStorage.setItem(storageKey(g), "1");
      } catch {}
    }
    listeners.forEach((l) => l());
  };

  const names = visible.map((g) => g.name).join(", ");
  return (
    <Alert className="px-3 py-2.5">
      <KeyRoundIcon />
      <AlertTitle>Revoke the Append API token you connected {names} with</AlertTitle>
      <AlertDescription className="text-pretty">
        roam.pub only needed it once to verify the graph and didn&apos;t keep it. In Roam, open Settings → Graph →
        API tokens and revoke it.
      </AlertDescription>
      <AlertAction>
        <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Dismiss">
          <XIcon />
        </Button>
      </AlertAction>
    </Alert>
  );
}
