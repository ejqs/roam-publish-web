"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  inviteByEmail,
  leave,
  offerTransfer,
  removeMemberAction,
  withdrawInvite,
} from "@/app/(app)/dashboard/member-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type MemberRow = { userId: string; email: string; name: string; detail?: string };
export type InviteRow = { id: string; email: string; kind: "member" | "transfer"; expiresAt: string };

const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { dateStyle: "medium" });

/**
 * Members of a graph or collection. The owner invites by email, removes members and offers
 * ownership; members can leave. Invites and transfers wait for the other person to accept.
 */
export function MembersPanel({
  type,
  targetId,
  isOwner,
  ownerEmail,
  meId,
  members,
  invites,
}: {
  type: "graph" | "collection";
  targetId: string;
  isOwner: boolean;
  ownerEmail: string;
  meId: string;
  members: MemberRow[];
  invites: InviteRow[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message);
      after?.();
      router.refresh();
    });
  }

  const what = type === "graph" ? "graph" : "collection";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          {type === "graph"
            ? "Members publish from this graph with their own API key and manage the pages they publish. You manage every page."
            : "Members add pages they publish to this collection and manage those entries. You manage every entry."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <ul className="divide-y rounded-sm border">
          <li className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="truncate">{ownerEmail}</span>
            <Badge variant="outline">Owner</Badge>
          </li>
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{m.email}</span>
                {m.detail && <span className="text-xs text-muted-foreground">{m.detail}</span>}
              </div>
              <div className="flex gap-1">
                {isOwner && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Offer ownership of this ${what} to ${m.email}? Nothing changes until they accept, then you become a member.`))
                          run(() => offerTransfer(type, targetId, m.userId));
                      }}
                    >
                      Transfer ownership
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Remove ${m.email}?${type === "graph" ? " Their API key stops working; their pages stay." : ""}`))
                          run(() => removeMemberAction(type, targetId, m.userId));
                      }}
                    >
                      Remove
                    </Button>
                  </>
                )}
                {!isOwner && m.userId === meId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Leave this ${what}?`)) run(() => leave(type, targetId), () => router.push("/dashboard"));
                    }}
                  >
                    Leave
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {isOwner && invites.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-medium">Waiting for an answer</h3>
            <ul className="divide-y rounded-sm border">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate">
                    {i.email}{" "}
                    <span className="text-xs text-muted-foreground">
                      {i.kind === "transfer" ? "· ownership transfer" : "· invite"} · expires {fmt(i.expiresAt)}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => withdrawInvite(i.id))}>
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isOwner && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => inviteByEmail(type, targetId, email), () => setEmail(""));
            }}
          >
            <div className="flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="their@email.com"
                aria-label="Email to invite"
                required
              />
              <Button type="submit" disabled={pending || !email}>
                Invite
              </Button>
            </div>
            <FieldDescription>
              They need a roam.pub account with a verified email and a graph of their own. Nothing changes until they
              accept.
            </FieldDescription>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
