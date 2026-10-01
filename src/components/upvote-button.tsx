"use client";

import { ArrowBigUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { VoteState } from "@/app/api/votes/route";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Upvote for a page listed on Discover. The server renders the count so the page stays the same for
 * every reader; the reader's own state loads afterwards, like the view beacon.
 */
export function UpvoteButton({ publicationId, initialCount }: { publicationId: string; initialCount: number }) {
  const [state, setState] = useState<VoteState | null>(null);
  const [pending, setPending] = useState(false);
  const count = state?.count ?? initialCount;

  useEffect(() => {
    fetch(`/api/votes?id=${publicationId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setState)
      .catch(() => {});
  }, [publicationId]);

  const inner = (
    <>
      <ArrowBigUp className={state?.voted ? "fill-current" : undefined} />
      <span className="tabular-nums">{count.toLocaleString("en-US")}</span>
      <span className="sr-only">{count === 1 ? "upvote" : "upvotes"}</span>
    </>
  );
  const look = buttonVariants({ variant: "outline", size: "sm" });

  if (state?.blocker === "owner")
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground" title="Upvotes on your page">
        {inner}
      </span>
    );
  if (state?.blocker === "signin" || state?.blocker === "nograph") {
    const signin = state.blocker === "signin";
    return (
      <Link
        href={signin ? `/login?next=${encodeURIComponent(location.pathname)}` : "/onboarding"}
        className={look}
        title={signin ? "Sign in to upvote" : "Connect a Roam graph to upvote"}
      >
        {inner}
      </Link>
    );
  }

  async function toggle() {
    if (!state) return;
    const prev = state;
    // Optimistic; rolled back if the server disagrees.
    setState({ ...prev, voted: !prev.voted, count: prev.count + (prev.voted ? -1 : 1) });
    setPending(true);
    try {
      const res = await fetch("/api/votes", { method: prev.voted ? "DELETE" : "POST", body: publicationId });
      if (res.status === 429) throw new Error("Too many votes. Try again in a minute.");
      const next = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
      if (next && "count" in next) setState(next);
      else throw new Error("Couldn't save your vote.");
    } catch (e) {
      setState(prev);
      toast.error(e instanceof Error ? e.message : "Couldn't save your vote.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant={state?.voted ? "secondary" : "outline"}
      size="sm"
      onClick={toggle}
      disabled={!state || pending}
      aria-pressed={state?.voted ?? false}
      title={state?.voted ? "Remove upvote" : "Upvote"}
    >
      {inner}
    </Button>
  );
}
