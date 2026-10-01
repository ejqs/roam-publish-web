"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { claimUsername, setProfilePublic } from "./actions";

export function ProfileCard({
  username,
  isPublic,
  appUrl,
}: {
  username: string | null;
  isPublic: boolean;
  appUrl: string;
}) {
  const [state, claim, pending] = useActionState(claimUsername, null);
  const host = appUrl.replace(/^https?:\/\//, "");

  if (!username) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Claim a username to get a short link like {host}/u/yourname. You can do this any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={claim} className="flex max-w-md items-start gap-2">
            <Field className="flex-1" data-invalid={state && !state.ok ? true : undefined}>
              <Input name="username" placeholder="username" autoComplete="off" required aria-label="Username" />
              {state && !state.ok && <FieldError>{state.message}</FieldError>}
              <FieldDescription>Choose carefully: you can&apos;t change it yourself later.</FieldDescription>
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Claiming…" : "Claim"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const path = `/u/${username}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>@{username}</CardTitle>
        <CardDescription>
          {isPublic ? (
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
          <form action={setProfilePublic.bind(null, !isPublic)}>
            <Button type="submit" variant="outline">
              {isPublic ? "Make private" : "Make public"}
            </Button>
          </form>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
