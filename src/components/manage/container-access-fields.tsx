"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { applyAccessToAllPages } from "@/app/(app)/dashboard/place-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldDescription, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ENCRYPT_PASSWORD_MIN } from "@/lib/encryption-rules";
import type { Access } from "@/db/schema";
import { Choice, readOptions } from "./choice";

export type ContainerAccess = {
  indexAccess: Access;
  defaultAccess: Access;
  /** Pages added from now on that are password-protected are encrypted. */
  encryptNewPages: boolean;
  /** A new password, or "" to keep the current one. */
  password: string;
  clearPassword: boolean;
  /** The password now, needed to change it while encrypted pages use it. */
  currentPassword?: string;
  /** Change it without the current one: the encrypted pages need republishing. */
  resetEncrypted?: boolean;
};


/**
 * A graph's or collection's two access settings: who can open its front page, and what new pages
 * start as. Both share one password. The page default never changes existing pages; "Apply to
 * existing pages" does that explicitly.
 */
export function ContainerAccessFields({
  kind,
  label,
  containerId,
  pageCount,
  value,
  hasPassword,
  canEncrypt = false,
  encryptedPages = [],
  onChange,
}: {
  kind: "graph" | "collection";
  /** The graph's or collection's name, for "Members of …". */
  label: string;
  containerId: string;
  pageCount: number;
  value: ContainerAccess;
  /** Saved password, not the one being typed. */
  hasPassword: boolean;
  /** The saved password can encrypt pages: it has a key pair (set long enough, after encryption existed). */
  canEncrypt?: boolean;
  /** Titles of encrypted pages that open with this password. */
  encryptedPages?: string[];
  onChange: (v: ContainerAccess) => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const [encryptOpen, setEncryptOpen] = useState(false);
  const encrypted = encryptedPages.length;
  const pagesWord = `${encrypted.toLocaleString("en-US")} encrypted ${encrypted === 1 ? "page" : "pages"}`;
  const set = (patch: Partial<ContainerAccess>) => onChange({ ...value, ...patch });
  const usesPassword = value.indexAccess === "password" || value.defaultAccess === "password";
  const willHavePassword = value.password ? true : value.clearPassword ? false : hasPassword;
  return (
    <>
      <FieldSet>
        <FieldLegend variant="label">Front page</FieldLegend>
        <FieldDescription>Who can open this {kind}&apos;s page and see what&apos;s listed on it.</FieldDescription>
        <Choice id={`${kind}-index`} value={value.indexAccess} options={readOptions(label, "front page")} onChange={(indexAccess) => set({ indexAccess, defaultAccess: indexAccess })} />
      </FieldSet>
      <FieldSeparator />
      <FieldSet>
        <FieldLegend variant="label">New pages start as</FieldLegend>
        <FieldDescription>
          Pages {kind === "graph" ? "published" : "added"} from now on. Changing this doesn&apos;t change pages already
          here, and each page can be changed on its own. Protected pages are never listed on Discover.
        </FieldDescription>
        <Choice id={`${kind}-default`} value={value.defaultAccess} options={readOptions(label)} onChange={(defaultAccess) => set({ defaultAccess })} />
        <div className="flex items-start justify-between gap-4 pt-2">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${kind}-encrypt-new`}>Encrypt new password pages</FieldLabel>
            <FieldDescription>
              {value.defaultAccess === "password"
                ? `Pages ${kind === "graph" ? "published" : "added"} from now on are stored encrypted with the ${kind} password, so not even roam.pub can read them. Needs a password of at least ${ENCRYPT_PASSWORD_MIN} characters. Pages already here aren't changed.`
                : `Only applies while new pages start as Password.`}
            </FieldDescription>
            {value.encryptNewPages && value.defaultAccess === "password" && value.password && value.password.length < ENCRYPT_PASSWORD_MIN && (
              <FieldDescription className="text-destructive">
                The new password is too short to encrypt with.
              </FieldDescription>
            )}
          </div>
          <Switch
            id={`${kind}-encrypt-new`}
            checked={value.encryptNewPages && value.defaultAccess === "password"}
            disabled={value.defaultAccess !== "password"}
            onCheckedChange={(on) => (on ? setEncryptOpen(true) : set({ encryptNewPages: false }))}
          />
        </div>
        {encryptOpen && (
          <EncryptNewPagesDialog
            kind={kind}
            onClose={() => setEncryptOpen(false)}
            typed={value.password}
            savedCanEncrypt={canEncrypt && !value.clearPassword}
            onConfirm={(password) => {
              set(password === value.password ? { encryptNewPages: true } : { encryptNewPages: true, password, clearPassword: false });
              setEncryptOpen(false);
            }}
          />
        )}
        {pageCount > 0 && (
          <ApplyToPagesDialog
            kind={kind}
            label={label}
            containerId={containerId}
            pageCount={pageCount}
            initial={value.defaultAccess}
            hasPassword={hasPassword}
          />
        )}
      </FieldSet>
      <FieldSeparator />
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor={`${kind}-password`}>{hasPassword ? `Change the ${kind} password` : `${kind[0].toUpperCase()}${kind.slice(1)} password`}</FieldLabel>
        <Input
          id={`${kind}-password`}
          type="password"
          autoComplete="new-password"
          value={value.password}
          onChange={(e) => set({ password: e.target.value, clearPassword: false })}
          placeholder={hasPassword && !value.clearPassword ? "Leave blank to keep it" : usesPassword ? "Required for password access" : "Optional"}
        />
        <FieldDescription>
          {usesPassword && !willHavePassword
            ? "Set a password to use password access."
            : `${encrypted ? `It opens ${pagesWord}, so it needs at least ${ENCRYPT_PASSWORD_MIN} characters. ` : ""}Changing it signs out everyone who unlocked with the old one. Pages with their own password keep it.`}
        </FieldDescription>
        {encrypted > 0 && value.password && !value.resetEncrypted && (
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${kind}-current-password`}>Current {kind} password</FieldLabel>
            <Input
              id={`${kind}-current-password`}
              type="password"
              autoComplete="current-password"
              value={value.currentPassword ?? ""}
              onChange={(e) => set({ currentPassword: e.target.value })}
            />
            <FieldDescription>Needed to keep the {pagesWord} readable with the new password.</FieldDescription>
            <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => setResetOpen(true)}>
              Forgot it? Reset without the current password
            </Button>
          </div>
        )}
        {encrypted > 0 && value.password && value.resetEncrypted && (
          <p className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
            Saving resets the password. The {pagesWord} can&apos;t be read with it until you republish them from Roam.{" "}
            <button type="button" className="text-link hover:underline" onClick={() => set({ resetEncrypted: false })}>
              Undo
            </button>
          </p>
        )}
        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset the {label} password?</DialogTitle>
              <DialogDescription>
                Without the current password, {encrypted === 1 ? "this encrypted page" : `these ${encrypted} encrypted pages`}{" "}
                can&apos;t be opened with the new one. {encrypted === 1 ? "It stays" : "They stay"} unreadable until you
                republish {encrypted === 1 ? "it" : "them"} from Roam. Readers see that the page is being updated.
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-48 divide-y overflow-y-auto rounded-sm border text-sm">
              {encryptedPages.map((t, i) => (
                <li key={i} className="px-3 py-2 break-words">
                  {t}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">A page that&apos;s also in a place with another password stays readable there.</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  set({ resetEncrypted: true, currentPassword: "" });
                  setResetOpen(false);
                }}
              >
                Reset password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {hasPassword && !value.clearPassword && !usesPassword && (
          <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => set({ password: "", clearPassword: true })}>
            Remove the {kind} password
          </Button>
        )}
      </div>
    </>
  );
}

/**
 * Asked before "Encrypt new password pages" turns on: pages are sealed with the password, so it
 * must be one that can encrypt. Confirms the saved one when it already can, otherwise takes a new
 * password of at least ENCRYPT_PASSWORD_MIN characters that becomes the graph's or collection's.
 */
function EncryptNewPagesDialog({
  kind,
  onClose,
  typed,
  savedCanEncrypt,
  onConfirm,
}: {
  kind: "graph" | "collection";
  onClose: () => void;
  /** The new password typed in the form so far, or "". */
  typed: string;
  savedCanEncrypt: boolean;
  /** With the password to encrypt with: the typed one, a new one, or "" to keep the saved one. */
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState(typed);
  // Nothing new typed and the saved password can encrypt: only a confirmation is needed.
  const useSaved = !typed && savedCanEncrypt;
  const short = password.length < ENCRYPT_PASSWORD_MIN;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (useSaved) onConfirm("");
            else if (!short) onConfirm(password);
          }}
        >
          <DialogHeader>
            <DialogTitle>Encrypt new password pages?</DialogTitle>
            <DialogDescription>
              Pages {kind === "graph" ? "published" : "added"} from now on are stored encrypted with the {kind} password.
              If it&apos;s forgotten, we can&apos;t recover them: republish them from Roam to bring them back.
            </DialogDescription>
          </DialogHeader>
          {useSaved ? (
            <p className="text-sm">They&apos;re encrypted with the current {kind} password.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${kind}-encrypt-password`} className="text-sm font-medium">
                Encryption password
              </label>
              <Input
                id={`${kind}-encrypt-password`}
                type="password"
                autoComplete="new-password"
                autoFocus
                value={password}
                aria-invalid={!!password && short}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className={`text-xs ${password && short ? "text-destructive" : "text-muted-foreground"}`}>
                At least {ENCRYPT_PASSWORD_MIN} characters. It becomes the {kind} password when you save, so readers use it too.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!useSaved && short}>
              Turn on
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Sets who can read every page already in the graph or collection. */
function ApplyToPagesDialog({
  kind,
  label,
  containerId,
  pageCount,
  initial,
  hasPassword,
}: {
  kind: "graph" | "collection";
  label: string;
  containerId: string;
  pageCount: number;
  initial: Access;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState(initial);
  const [pending, start] = useTransition();
  const pages = `${pageCount.toLocaleString("en-US")} ${pageCount === 1 ? "page" : "pages"}`;

  function apply() {
    start(async () => {
      const res = await applyAccessToAllPages(kind, containerId, access);
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setAccess(initial);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="link" size="sm" className="self-start px-0">
            Apply to existing pages…
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change all {pages}</DialogTitle>
          <DialogDescription>
            Sets who can read every page in this {kind}, including pages you set one by one. Pages with their own
            password keep it, and encrypted pages keep Password.
          </DialogDescription>
        </DialogHeader>
        <Choice
          id={`${kind}-apply`}
          value={access}
          options={readOptions(label).map((o) =>
            o.value === "password" && !hasPassword
              ? { ...o, description: `Only pages with their own password, unless you save a ${kind} password first.` }
              : o,
          )}
          onChange={setAccess}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={apply} disabled={pending}>
            {pending ? "Applying…" : `Apply to ${pages}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
