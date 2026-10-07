"use client";

import { ExternalLinkIcon, GlobeIcon, LockIcon, MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { DESCRIPTION_MAX } from "@/lib/descriptions";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { claimUsername, setProfilePublic, updateBio } from "./actions";

export function ProfileCard({
  username,
  isPublic,
  bio,
  hasGraph,
  appUrl,
  stats,
}: {
  username: string | null;
  isPublic: boolean;
  bio: string;
  /** Usernames and public profiles need a verified Roam graph. */
  hasGraph: boolean;
  appUrl: string;
  /** A line of totals along the bottom. */
  stats?: React.ReactNode;
}) {
  const [state, claim, pending] = useActionState(claimUsername, null);
  const host = appUrl.replace(/^https?:\/\//, "");

  if (!username) {
    return (
      <Card id="profile" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            {hasGraph ? (
              <>Claim a username to get a short link like {host}/u/yourname. You can do this any time.</>
            ) : (
              <>
                Usernames are for people who publish from Roam.{" "}
                <Link href="/onboarding" className="text-link hover:underline">
                  Connect a graph
                </Link>{" "}
                to claim {host}/u/yourname.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={claim}
            onSubmit={(e) => {
              // A username can't be changed later, so ask before claiming it.
              const name = String(new FormData(e.currentTarget).get("username") ?? "").trim();
              if (name && !confirm(`Claim @${name}? You can't change it yourself later.`)) e.preventDefault();
            }}
            className="flex max-w-md items-start gap-2"
          >
            <Field className="flex-1" data-invalid={state && !state.ok ? true : undefined}>
              <Input
                name="username"
                placeholder="username"
                autoComplete="off"
                required
                disabled={!hasGraph}
                aria-label="Username"
              />
              {state && !state.ok && <FieldError>{state.message}</FieldError>}
              {hasGraph && (
                <FieldDescription>Choose carefully: you can&apos;t change it yourself later.</FieldDescription>
              )}
            </Field>
            <Button type="submit" disabled={pending || !hasGraph}>
              {pending ? "Claiming…" : "Claim"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const path = `/u/${username}`;
  return (
    <Card id="profile" className="scroll-mt-4">
      <CardContent className="flex flex-wrap items-start gap-4">
        <div
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-muted text-base font-semibold uppercase"
        >
          {username[0]}
        </div>
        <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">@{username}</h2>
            {hasGraph &&
              (isPublic ? (
                <Badge variant="outline" className="border-transparent bg-success/10 text-success">
                  <GlobeIcon />
                  Public
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <LockIcon />
                  Private
                </Badge>
              ))}
          </div>
          {!hasGraph ? (
            <p className="text-sm text-muted-foreground">Your profile is hidden until you connect a Roam graph.</p>
          ) : (
            <>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                {isPublic ? (
                  <>
                    <Link href={path} className="text-link hover:underline">
                      {host}
                      {path}
                    </Link>
                    <CopyButton text={`${appUrl}${path}`} label="Copy profile link" variant="ghost" size="icon-xs" />
                  </>
                ) : (
                  <>Make it public to share {host + path}.</>
                )}
              </div>
              <Bio bio={bio} />
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!hasGraph ? (
            <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>
              Connect a graph
            </Link>
          ) : (
            <>
              {isPublic && (
                <Link href={path} className={buttonVariants({ variant: "outline" })}>
                  View profile
                  <ExternalLinkIcon />
                </Link>
              )}
              <VisibilityMenu isPublic={isPublic} />
            </>
          )}
        </div>
      </CardContent>
      {stats && (
        <CardFooter className="flex-wrap gap-x-6 py-2.5 gap-y-1 text-[13px] text-muted-foreground">{stats}</CardFooter>
      )}
    </Card>
  );
}

/** "Make private" / "Make public" behind a ··· button. Closes on choosing, so it reopens cleanly. */
function VisibilityMenu({ isPublic }: { isPublic: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="More profile options">
            <MoreHorizontalIcon />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-44 gap-0.5 p-1">
        <form action={setProfilePublic.bind(null, !isPublic)} onSubmit={() => setOpen(false)}>
          <button type="submit" className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
            {isPublic ? "Make private" : "Make public"}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** The description as text, swapped for the form while editing. */
function Bio({ bio }: { bio: string }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <BioForm bio={bio} onDone={() => setEditing(false)} />;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
      {bio && <p className="break-words">{bio}</p>}
      <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setEditing(true)}>
        {bio ? "Edit description" : "Add a description"}
      </Button>
    </div>
  );
}

function BioForm({ bio, onDone }: { bio: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateBio, null);
  const [value, setValue] = useState(bio);
  const dirty = value.replace(/\s+/g, " ").trim() !== bio;
  useUnsavedChanges(dirty);

  return (
    <form action={action} className="flex max-w-xl flex-col gap-2">
      <Field data-invalid={state && !state.ok ? true : undefined}>
        <FieldLabel htmlFor="profile-bio">Description</FieldLabel>
        <Textarea
          id="profile-bio"
          name="bio"
          rows={2}
          autoFocus
          maxLength={DESCRIPTION_MAX}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a short description of you or what you publish"
        />
        <div className="flex items-start justify-between gap-2">
          {state && !state.ok ? (
            <FieldError>{state.message}</FieldError>
          ) : (
            <FieldDescription aria-live="polite">
              {state?.ok && !dirty ? state.message : "Shown on your public profile. Plain text."}
            </FieldDescription>
          )}
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {value.length}/{DESCRIPTION_MAX}
          </span>
        </div>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save description"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {state?.ok && !dirty ? "Done" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}
