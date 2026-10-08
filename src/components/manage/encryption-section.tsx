"use client";

import { RefreshCwIcon, SearchIcon, ShieldCheckIcon, TriangleAlertIcon, TypeIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setEncryption } from "@/server/actions/encryption";
import { updateEntry, updateGraphPlace } from "@/server/actions/places";
import { EncryptedIcon } from "@/components/encrypted-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ENCRYPT_PASSWORD_MIN, NEEDS_REPUBLISH } from "@/lib/encryption-rules";
import type { ManageData } from "@/lib/manage-data";
import { usePasswordPrompt } from "./password-prompt";

type Spot = {
  label: string;
  access: "open" | "password" | "members";
  hasPassword: boolean;
  /** Switches this place to Password, when the viewer can change it. */
  protect?: () => Promise<{ ok: boolean; message: string }>;
};

const effective = (access: string, def: "open" | "password" | "members") =>
  (access === "inherit" ? def : access) as Spot["access"];

/** Everywhere the page is shown, with who can read it there. A graph place that's switched off doesn't count. */
function spotsOf(data: ManageData): Spot[] {
  const g = data.graphPlace;
  return [
    ...(g.inGraph
      ? [
          {
            label: data.origin.graphName,
            access: effective(g.state.access, g.container.defaultAccess),
            hasPassword: g.state.hasOwnPassword || g.container.hasPassword,
            protect: data.canManagePage ? () => updateGraphPlace(data.publicationId, { access: "password" }) : undefined,
          },
        ]
      : []),
    ...data.entries.map((e) => ({
      label: e.collectionName,
      access: effective(e.state.access, e.container.defaultAccess),
      hasPassword: e.state.hasOwnPassword || e.container.hasPassword,
      protect: e.canManage ? () => updateEntry(e.entryId, { access: "password" }) : undefined,
    })),
  ];
}

const ACCESS_WORDS = { open: "Anyone", members: "Members", password: "Password" } as const;

/**
 * Turns encryption on or off for a page, in the Manage dialog. Encrypting needs Password
 * everywhere the page is published, then a confirmation, then (once per password set before
 * encryption existed) that password. Only for people who manage the page itself.
 */
export function EncryptionSection({
  data,
  onChanged,
  compact,
}: {
  data: ManageData;
  onChanged: () => void;
  /** Inside a place's password panel: no heading, and the republish warning is shown by the dialog. */
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<"on" | "off" | null>(null);
  const [need, setNeed] = useState<{ lock: string; label: string }[] | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const passwordPrompt = usePasswordPrompt();

  const spots = spotsOf(data);
  const blocked = spots.filter((s) => s.access !== "password" || !s.hasPassword);
  const canTurnOn = !data.encrypted && spots.length > 0 && blocked.length === 0;
  // Encryption only works with a password, so it's offered once the page uses Password somewhere.
  const usesPassword = spots.some((s) => s.access === "password");

  function close() {
    setConfirming(null);
    setNeed(null);
    setPasswords({});
    setError("");
  }

  function encrypt() {
    start(async () => {
      const res = await setEncryption(data.publicationId, { on: true, passwords });
      if (res.ok) {
        toast.success(res.message);
        close();
        return onChanged();
      }
      if (res.need) {
        setNeed(res.need);
        setError(Object.keys(passwords).length ? res.message : "");
      } else setError(res.message);
    });
  }

  function decrypt() {
    start(async () => {
      const res = await passwordPrompt.run(
        (currentPassword) => setEncryption(data.publicationId, { on: false, currentPassword }),
        {
          title: "Turn off encryption",
          description: "Enter a password that opens this page.",
          label: "Password",
        },
      );
      if (!res) return;
      if (!res.ok) return setError(res.message);
      toast.success(res.message);
      close();
      onChanged();
    });
  }

  function protect(s: Spot) {
    start(async () => {
      const res = await s.protect!();
      if (!res.ok) toast.error(res.message);
      onChanged();
    });
  }

  if (!data.encrypted && !usesPassword) return null;

  return (
    <section className={compact ? "flex flex-col gap-2.5" : "flex flex-col gap-2.5 border-t pt-3"}>
      {!compact && <h3 className="font-medium">Encryption</h3>}
      <div className="flex items-start gap-3">
        {data.encrypted ? (
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
        ) : (
          <EncryptedIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={`encrypt-${data.publicationId}`} className="font-medium">
            {compact ? "Encrypt the page" : "Encrypt with password"}
          </label>
          <span className="text-xs text-muted-foreground">
            {data.encrypted
              ? `Encrypted. It opens with the ${spots.map((s) => s.label).join(" or the ")} password.`
              : "Stores the page so only its password can open it. Even someone with a copy of the database can't read it."}
          </span>
        </div>
        <Switch
          id={`encrypt-${data.publicationId}`}
          checked={data.encrypted}
          disabled={pending || (!data.encrypted && !canTurnOn)}
          onCheckedChange={(on) => setConfirming(on ? "on" : "off")}
        />
      </div>

      {data.needsRepublish && !compact && (
        <p className="flex gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <RefreshCwIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Needs republish. {NEEDS_REPUBLISH}</span>
        </p>
      )}

      {!data.encrypted && blocked.length > 0 && (
        <div role="status" className="flex gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex min-w-0 flex-col gap-2.5">
            <span>
              {spots.length === 0
                ? "It isn't shown anywhere, so there's nothing to encrypt it for."
                : `To encrypt it, set it to Password everywhere it's published. It's ${blocked
                    .map((s) => `${s.access === "password" ? "missing a password" : ACCESS_WORDS[s.access]} in ${s.label}`)
                    .join(", ")}.`}
            </span>
            {blocked.some((s) => s.protect && s.hasPassword && s.access !== "password") && (
              <span className="flex flex-wrap gap-2">
                {blocked
                  .filter((s) => s.protect && s.hasPassword && s.access !== "password")
                  .map((s) => (
                    <Button key={s.label} variant="outline" size="sm" disabled={pending} onClick={() => protect(s)}>
                      Set {s.label} to Password
                    </Button>
                  ))}
              </span>
            )}
            {blocked.some((s) => !s.hasPassword) && (
              <span className="text-xs text-muted-foreground">
                Where there&apos;s no password yet, choose Password for that place above and set one.
              </span>
            )}
          </div>
        </div>
      )}
      {data.encrypted && (
        <span className="text-xs text-muted-foreground">
          Turning it off asks for one of those passwords, then stores the page readable again.
        </span>
      )}
      {error && !confirming && <p className="text-xs text-destructive">{error}</p>}

      <Dialog open={!!confirming} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          {confirming === "off" ? (
            <>
              <DialogHeader>
                <DialogTitle>Turn off encryption?</DialogTitle>
                <DialogDescription>
                  The page is stored readable again, and search, tags and excerpts come back. Readers still need the password.
                </DialogDescription>
              </DialogHeader>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={decrypt} disabled={pending}>
                  Turn off encryption
                </Button>
              </DialogFooter>
            </>
          ) : need ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                encrypt();
              }}
            >
              <DialogHeader>
                <DialogTitle>Encrypt this page</DialogTitle>
                <DialogDescription>
                  It&apos;s protected by the {need.map((n) => n.label).join(" and ")} password. Enter{" "}
                  {need.length === 1 ? "it" : "each"} once so the page can be encrypted with {need.length === 1 ? "it" : "them"}.
                </DialogDescription>
              </DialogHeader>
              {need.map((n, i) => (
                <div key={n.lock} className="flex flex-col gap-1.5">
                  <label htmlFor={`need-${n.lock}`} className="text-sm font-medium">
                    {n.label} password
                  </label>
                  <Input
                    id={`need-${n.lock}`}
                    type="password"
                    autoComplete="current-password"
                    autoFocus={i === 0}
                    value={passwords[n.lock] ?? ""}
                    aria-invalid={!!error}
                    onChange={(e) => setPasswords({ ...passwords, [n.lock]: e.target.value })}
                  />
                </div>
              ))}
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The password readers already use. It isn&apos;t changed. Encrypted pages need at least {ENCRYPT_PASSWORD_MIN} characters.
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || need.some((n) => !passwords[n.lock])}>
                  Continue
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="break-words">Encrypt &ldquo;{data.title}&rdquo;?</DialogTitle>
                <DialogDescription>Readers still open it with the password, as they do now. What changes:</DialogDescription>
              </DialogHeader>
              <ul className="flex flex-col gap-2.5 text-sm">
                <li className="flex gap-2.5">
                  <UsersIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  Everyone needs the password, including members and you.
                </li>
                <li className="flex gap-2.5">
                  <SearchIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  Search, tags, related pages and excerpts are off for this page.
                </li>
                <li className="flex gap-2.5">
                  <TypeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  The title isn&apos;t encrypted. It&apos;s in the link and on listings.
                </li>
                <li className="flex gap-2.5">
                  <RefreshCwIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  If the password is forgotten, we can&apos;t recover the page. Republish it from Roam to bring it back.
                </li>
              </ul>
              <p className="rounded-sm bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                Readers&apos; browsers decrypt it, so roam.pub never reads it to show it. It isn&apos;t fully end-to-end yet:
                roam.pub still sees the text when you publish it from Roam.{" "}
                <Link href="/privacy/encryption" target="_blank" className="text-link hover:underline">
                  How encrypted pages work
                </Link>
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={encrypt} disabled={pending}>
                  <EncryptedIcon /> Encrypt
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {passwordPrompt.element}
    </section>
  );
}
