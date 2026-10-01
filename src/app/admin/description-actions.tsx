"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adminClearBio, adminClearGraphDescription, adminClearUsername } from "./actions";

function useConfirmRun() {
  const [pending, start] = useTransition();
  const run = (question: string, fn: () => Promise<{ ok: boolean; message: string } | null>) => {
    if (!confirm(question)) return;
    start(async () => {
      const res = await fn();
      if (res) (res.ok ? toast.success : toast.error)(res.message);
    });
  };
  return [pending, run] as const;
}

/** Blanks a reported graph's front page description; settles the graph-level reports. */
export function GraphDescriptionAction({ graphId, graphName }: { graphId: string; graphName: string }) {
  const [pending, run] = useConfirmRun();
  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={() => run(`Clear the description on ${graphName}?`, () => adminClearGraphDescription(graphId))}
    >
      Clear description
    </Button>
  );
}

/** Actions for a reported profile. Both settle its open reports as actioned. */
export function ProfileActions({ userId, username, hasBio }: { userId: string; username: string; hasBio: boolean }) {
  const [pending, run] = useConfirmRun();
  return (
    <>
      {hasBio && (
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() => run(`Clear the description on @${username}?`, () => adminClearBio(userId))}
        >
          Clear description
        </Button>
      )}
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          run(`Clear @${username}? The name stays reserved and /u/${username} will 404.`, () =>
            adminClearUsername(userId),
          )
        }
      >
        Clear username
      </Button>
    </>
  );
}
