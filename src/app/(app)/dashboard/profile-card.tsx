"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BIO_MAX } from "@/lib/bio";
import { claimUsername, setProfilePublic, updateBio } from "./actions";

export function ProfileCard({
  username,
  isPublic,
  bio,
  hasGraph,
  appUrl,
}: {
  username: string | null;
  isPublic: boolean;
  bio: string;
  /** Usernames and public profiles need a verified Roam graph. */
  hasGraph: boolean;
  appUrl: string;
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
          <form action={claim} className="flex max-w-md items-start gap-2">
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
      <CardHeader>
        <CardTitle>@{username}</CardTitle>
        <CardDescription>
          {!hasGraph ? (
            <>Your profile is hidden until you connect a Roam graph.</>
          ) : isPublic ? (
            <>
              Public profile at{" "}
              <Link href={path} className="text-link hover:underline">
                {host}
                {path}
              </Link>
            </>
          ) : (
            <>Your profile is private. Make it public to share {host + path}.</>
          )}
        </CardDescription>
        <CardAction>
          {hasGraph ? (
            <form action={setProfilePublic.bind(null, !isPublic)}>
              <Button type="submit" variant="outline">
                {isPublic ? "Make private" : "Make public"}
              </Button>
            </form>
          ) : (
            <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>
              Connect a graph
            </Link>
          )}
        </CardAction>
      </CardHeader>
      {hasGraph && (
        <CardContent>
          <BioForm bio={bio} />
        </CardContent>
      )}
    </Card>
  );
}

function BioForm({ bio }: { bio: string }) {
  const [state, action, pending] = useActionState(updateBio, null);
  const [value, setValue] = useState(bio);
  const dirty = value.replace(/\s+/g, " ").trim() !== bio;

  return (
    <form action={action} className="flex max-w-xl flex-col gap-2">
      <Field data-invalid={state && !state.ok ? true : undefined}>
        <FieldLabel htmlFor="profile-bio">Description</FieldLabel>
        <Textarea
          id="profile-bio"
          name="bio"
          rows={2}
          maxLength={BIO_MAX}
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
            {value.length}/{BIO_MAX}
          </span>
        </div>
      </Field>
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save description"}
        </Button>
      </div>
    </form>
  );
}
