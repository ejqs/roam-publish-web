"use client";

import { useState } from "react";
import { DeleteDialog } from "@/components/manage/delete-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Deleting takes the link better-auth emails; see user.deleteUser in src/lib/auth.ts. */
export function DeleteAccountCard({
  email,
  graphs,
  pages,
  collections,
}: {
  email: string;
  /** Graphs they own. */
  graphs: string[];
  /** Pages in those graphs. */
  pages: number;
  collections: number;
}) {
  const [sent, setSent] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Permanently delete your account and everything you published on roam.pub. Nothing in Roam changes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <Alert>
            <AlertDescription>
              Check {email}. Open the link in it while signed in here to finish deleting your account.
            </AlertDescription>
          </Alert>
        ) : (
          <DeleteDialog
            trigger="Delete account"
            title="Delete your account?"
            confirmText="delete my account"
            confirmLabel="Email me the link"
            onConfirm={async () => {
              const { error } = await authClient.deleteUser({ callbackURL: "/" });
              if (error) return error.message ?? "Could not delete your account.";
              setSent(true);
            }}
          >
            <p>
              This deletes{" "}
              {graphs.length ? `${plural(graphs.length, "graph")} (${graphs.join(", ")}) with ${plural(pages, "page")}, ` : ""}
              pages you published in other people&apos;s graphs, {plural(collections, "collection")} you own,
              your username, your API keys and your sign-in. Links to your pages stop working. This can&apos;t be undone.
            </p>
            <p>
              If a moderator acted on your account, a graph or a collection, your email, graph names and
              usernames stay blocked from roam.pub after deleting.
            </p>
            <p>We&apos;ll email you a link to confirm.</p>
          </DeleteDialog>
        )}
      </CardContent>
    </Card>
  );
}
