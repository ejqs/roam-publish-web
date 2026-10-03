"use client";

import { ChevronUp } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import type { VoteBlocker, VoteState } from "@/app/api/votes/route";

/*
 * One rule across the site: a bordered button means you can upvote, a bare count means you can't
 * (signed out, no graph, your own page, or your state hasn't loaded yet). Never a faded button.
 */

const VOTED = "bg-primary/10 font-medium text-primary-hover shadow-[inset_0_0_0_1px_rgba(45,114,210,0.55)] hover:bg-primary/15 dark:text-link";
const OPEN = "bg-card text-foreground shadow-[inset_0_0_0_1px_rgba(17,20,24,0.2),0_1px_2px_rgba(17,20,24,0.1)] hover:bg-muted dark:shadow-[inset_0_0_0_1px_var(--input)]";

const FOCUS = "cursor-pointer outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50";

const TITLES: Record<NonNullable<VoteBlocker>, string> = {
  signin: "Sign in to upvote",
  nograph: "Connect a Roam graph to upvote",
  owner: "Upvotes on your page",
};

const label = (n: number) => (n === 1 ? "upvote" : "upvotes");

/** The reader's state once loaded, plus an optimistic toggle that rolls back if the server disagrees. */
function useVote(publicationId: string, loaded: VoteState | null) {
  const [own, setOwn] = useState<VoteState | null>(null);
  const [pending, setPending] = useState(false);
  const state = own ?? loaded;

  async function toggle() {
    if (!state || state.blocker || pending) return;
    const prev = state;
    setOwn({ ...prev, voted: !prev.voted, count: prev.count + (prev.voted ? -1 : 1) });
    setPending(true);
    try {
      const res = await fetch("/api/votes", { method: prev.voted ? "DELETE" : "POST", body: publicationId });
      if (res.status === 429) throw new Error("Too many votes. Try again in a minute.");
      const next = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
      if (next && "count" in next) setOwn(next);
      else throw new Error("Couldn't save your vote.");
    } catch (e) {
      setOwn(prev);
      toast.error(e instanceof Error ? e.message : "Couldn't save your vote.");
    } finally {
      setPending(false);
    }
  }

  return { state, toggle };
}

function Chevron({ voted, className }: { voted: boolean; className: string }) {
  return <ChevronUp className={className} strokeWidth={voted ? 2.75 : 2} aria-hidden />;
}

/**
 * Upvote in a page's footer. The server renders the count so the page stays the same for every
 * reader; the reader's own state loads afterwards, like the view beacon.
 */
export function UpvoteButton({ publicationId, initialCount }: { publicationId: string; initialCount: number }) {
  const [loaded, setLoaded] = useState<VoteState | null>(null);
  const { state, toggle } = useVote(publicationId, loaded);
  const count = state?.count ?? initialCount;

  useEffect(() => {
    fetch(`/api/votes?id=${publicationId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setLoaded)
      .catch(() => {});
  }, [publicationId]);

  if (!state || state.blocker) {
    const blocker = state?.blocker;
    const hint = "text-xs text-link hover:underline";
    return (
      <span className="inline-flex items-center gap-3 text-sm text-muted-foreground">
        <span className="inline-flex h-[30px] items-center gap-1.5">
          <Chevron voted={false} className="size-3.5" />
          <span className="tabular-nums">
            {count.toLocaleString("en-US")} {label(count)}
          </span>
        </span>
        {blocker === "signin" && (
          <Link href={`/login?next=${encodeURIComponent(location.pathname)}`} className={hint}>
            Sign in to upvote
          </Link>
        )}
        {blocker === "nograph" && (
          <Link href="/onboarding" className={hint}>
            Connect a graph to upvote
          </Link>
        )}
        {blocker === "owner" && <span className="text-xs">on your page</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state.voted}
      title={state.voted ? "Remove upvote" : "Upvote"}
      className={cn("inline-flex h-[30px] items-center gap-1.5 rounded-sm px-2.5 text-sm", FOCUS, state.voted ? VOTED : OPEN)}
    >
      <Chevron voted={state.voted} className="size-3.5" />
      <span className="tabular-nums">{count.toLocaleString("en-US")}</span>
      <span className="sr-only">{label(count)}</span>
    </button>
  );
}

const ListVotes = createContext<Record<string, VoteState> | null>(null);

/** Loads the reader's vote state for every page in a Discover list in one request. */
export function ListVotesProvider({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const [states, setStates] = useState<Record<string, VoteState> | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    if (!key) return;
    fetch(`/api/votes?ids=${key}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setStates)
      .catch(() => {});
  }, [key]);

  return <ListVotes.Provider value={states}>{children}</ListVotes.Provider>;
}

/** What a signed-out or graphless reader needs to do before they can upvote from the list. */
export function ListVotesHint() {
  const states = useContext(ListVotes);
  const blocker = states && Object.values(states).find((s) => s.blocker !== "owner")?.blocker;
  if (blocker === "signin")
    return (
      <p className="text-sm text-muted-foreground">
        <Link href="/login?next=/discover" className="text-link hover:underline">
          Sign in
        </Link>{" "}
        with a Roam graph to upvote pages.
      </p>
    );
  if (blocker === "nograph")
    return (
      <p className="text-sm text-muted-foreground">
        <Link href="/onboarding" className="text-link hover:underline">
          Connect a Roam graph
        </Link>{" "}
        to upvote pages.
      </p>
    );
  if (states && Object.values(states).some((s) => s.blocker === "owner"))
    return (
      <p className="text-xs text-muted-foreground">
        You can&apos;t upvote your own pages, so their votes stay hidden until someone else upvotes them.
      </p>
    );
  return null;
}

/**
 * The score tile beside a Discover row: a button when the reader can upvote, a bare count when not,
 * and nothing when there's no count to show and no vote to cast.
 */
export function ListUpvote({ publicationId, initialCount }: { publicationId: string; initialCount: number }) {
  const loaded = useContext(ListVotes)?.[publicationId] ?? null;
  const { state, toggle } = useVote(publicationId, loaded);
  const count = state?.count ?? initialCount;
  const tile = "flex size-11 shrink-0 flex-col items-center justify-center rounded-sm text-xs tabular-nums";
  const inner = (voted: boolean) => (
    <>
      <Chevron voted={voted} className="size-4" />
      <span>{count.toLocaleString("en-US")}</span>
      <span className="sr-only">{label(count)}</span>
    </>
  );

  if (!state || state.blocker) {
    if (count === 0) return null;
    return (
      <span className={cn(tile, "font-medium text-muted-foreground")} title={state?.blocker ? TITLES[state.blocker] : undefined}>
        {inner(false)}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state.voted}
      title={state.voted ? "Remove upvote" : "Upvote"}
      className={cn(tile, "font-medium", FOCUS, state.voted ? VOTED : OPEN)}
    >
      {inner(state.voted)}
    </button>
  );
}
