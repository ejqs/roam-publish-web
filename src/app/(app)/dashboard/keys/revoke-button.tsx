"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revokeKey } from "@/server/actions/keys";

/** Revokes the viewer's key for a graph, after asking: the extension stops publishing with it at once. */
export function RevokeKeyButton({ graphId, graphName }: { graphId: string; graphName: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Revoke your key for ${graphName}? The extension can't publish from it until you get a new key and paste it in Roam.`))
          return;
        start(async () => {
          await revokeKey(graphId);
        });
      }}
    >
      {pending ? "Revoking…" : "Revoke"}
    </Button>
  );
}
