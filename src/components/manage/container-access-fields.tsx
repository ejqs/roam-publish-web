"use client";

import { ExternalLinkIcon, LockOpenIcon, RefreshCwIcon, SearchIcon, TypeIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { decryptExistingPages, encryptExistingPages, type BulkEncryptionResult, type SkippedPage } from "@/server/actions/encryption";
import { applyAccessToAllPages } from "@/server/actions/places";
import { EncryptedIcon } from "@/components/encrypted-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldDescription, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { decryptExistingPagesBlocked, E2E_EXTENSION, ENCRYPT_PASSWORD_MIN, encryptExistingPagesBlocked } from "@/lib/encryption-rules";
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
 * Whether new pages can be encrypted with the password the form would save: a new one long enough,
 * or the saved one when it already has a key pair (`canEncrypt`).
 */
export function encryptablePassword(value: ContainerAccess, canEncrypt: boolean) {
  if (value.password) return value.password.length >= ENCRYPT_PASSWORD_MIN;
  return !value.clearPassword && canEncrypt;
}

/** The settings to save: "Encrypt new password pages" only stays on while it can work. */
export function accessToSave(value: ContainerAccess, canEncrypt: boolean): ContainerAccess {
  const on = value.encryptNewPages && value.defaultAccess === "password" && encryptablePassword(value, canEncrypt);
  return { ...value, encryptNewPages: on };
}

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
  canEncrypt,
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
  /** The saved password has a key pair, so pages can be encrypted with it without typing it again. */
  canEncrypt: boolean;
  /** Titles of encrypted pages that open with this password. */
  encryptedPages?: string[];
  onChange: (v: ContainerAccess) => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmEncrypt, setConfirmEncrypt] = useState(false);
  /** The password typed in the confirmation, when there isn't one to encrypt with yet. */
  const [encryptPassword, setEncryptPassword] = useState("");
  const encrypted = encryptedPages.length;
  const pagesWord = `${encrypted.toLocaleString("en-US")} encrypted ${encrypted === 1 ? "page" : "pages"}`;
  const set = (patch: Partial<ContainerAccess>) => onChange({ ...value, ...patch });
  const usesPassword = value.indexAccess === "password" || value.defaultAccess === "password";
  const willHavePassword = value.password ? true : value.clearPassword ? false : hasPassword;
  const passwordDefault = value.defaultAccess === "password";
  const canTurnOnEncrypt = passwordDefault && encryptablePassword(value, canEncrypt);
  const encryptOn = accessToSave(value, canEncrypt).encryptNewPages;
  const pagesVerb = kind === "graph" ? "published" : "added";
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
        <div className="flex items-start justify-between gap-4 pt-2">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${kind}-encrypt-new`}>Encrypt new password pages</FieldLabel>
            <FieldDescription>
              {passwordDefault
                ? `Pages ${pagesVerb} from now on are stored encrypted with the ${kind} password, so a copy of the database can't read them. Needs a password of at least ${ENCRYPT_PASSWORD_MIN} characters. Pages already here aren't changed: encrypt them below.`
                : `Only applies while new pages start as Password.`}
            </FieldDescription>
            {passwordDefault && !canTurnOnEncrypt && (
              <FieldDescription className={value.encryptNewPages ? "text-destructive" : undefined}>
                {value.password
                  ? `The new password is too short to encrypt with.`
                  : hasPassword && !value.clearPassword
                    ? `The ${kind} password was set before encryption existed or is too short. Turning this on asks for one of at least ${ENCRYPT_PASSWORD_MIN} characters.`
                    : `Turning it on asks for a ${kind} password of at least ${ENCRYPT_PASSWORD_MIN} characters.`}
              </FieldDescription>
            )}
          </div>
          <Switch
            id={`${kind}-encrypt-new`}
            checked={encryptOn}
            disabled={!encryptOn && !passwordDefault}
            onCheckedChange={(on) => {
              if (!on) return set({ encryptNewPages: false });
              setEncryptPassword(value.password);
              setConfirmEncrypt(true);
            }}
          />
        </div>
        <Dialog open={confirmEncrypt} onOpenChange={setConfirmEncrypt}>
          <DialogContent className="sm:max-w-md">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (canTurnOnEncrypt) set({ encryptNewPages: true });
                else if (encryptPassword.length >= ENCRYPT_PASSWORD_MIN)
                  set({ encryptNewPages: true, password: encryptPassword, clearPassword: false });
                else return;
                setConfirmEncrypt(false);
              }}
            >
              <DialogHeader>
                <DialogTitle className="break-words">Encrypt new password pages in {label}?</DialogTitle>
                <DialogDescription>
                  Pages {pagesVerb} from now on that start as Password are stored encrypted with the {kind} password.
                  Readers still open them with it. What changes for those pages:
                </DialogDescription>
              </DialogHeader>
              <EncryptConsequences />
              {!canTurnOnEncrypt && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${kind}-encrypt-password`} className="text-sm font-medium">
                    Encryption password
                  </label>
                  <Input
                    id={`${kind}-encrypt-password`}
                    type="password"
                    autoComplete="new-password"
                    autoFocus
                    value={encryptPassword}
                    aria-invalid={!!encryptPassword && encryptPassword.length < ENCRYPT_PASSWORD_MIN}
                    onChange={(e) => setEncryptPassword(e.target.value)}
                  />
                  <p
                    className={`text-xs ${encryptPassword && encryptPassword.length < ENCRYPT_PASSWORD_MIN ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    At least {ENCRYPT_PASSWORD_MIN} characters. It becomes the {kind} password when you save, so readers use it
                    too.
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfirmEncrypt(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canTurnOnEncrypt && encryptPassword.length < ENCRYPT_PASSWORD_MIN}>
                  <EncryptedIcon /> Encrypt new pages
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {pageCount > 0 && (
          <EncryptExistingDialog
            kind={kind}
            label={label}
            containerId={containerId}
            blocked={encryptExistingPagesBlocked(kind, { canEncrypt: hasPassword && canEncrypt, unsavedPassword: !!value.password || value.clearPassword })}
          />
        )}
        {encrypted > 0 && <DecryptExistingDialog kind={kind} label={label} containerId={containerId} />}
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
            Change who can read existing pages…
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

/** What encrypting changes for a page, for the dialogs that do it. */
function EncryptConsequences() {
  return (
    <>
      <ul className="flex flex-col gap-2.5 text-sm">
        <li className="flex gap-2.5">
          <UsersIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          Everyone needs the password, including members and you.
        </li>
        <li className="flex gap-2.5">
          <SearchIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          Search, tags, related pages and excerpts are off for them.
        </li>
        <li className="flex gap-2.5">
          <TypeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          Titles aren&apos;t encrypted. They&apos;re in the link and on listings.
        </li>
        <li className="flex gap-2.5">
          <RefreshCwIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          If the password is forgotten, we can&apos;t recover them. Republish them from Roam to bring them back.
        </li>
      </ul>
      <p className="rounded-sm bg-muted px-3 py-2.5 text-xs text-muted-foreground">
        Readers&apos; browsers decrypt them, so roam.pub never reads them to show them. Pages published from extension{" "}
        {E2E_EXTENSION} or newer are encrypted in Roam, so roam.pub never sees their text (encryption v2). Pages
        encrypted on roam.pub are v1 until they&apos;re republished.{" "}
        <Link href="/privacy/encryption" target="_blank" className="text-link hover:underline">
          How encrypted pages work
        </Link>
      </p>
    </>
  );
}

/**
 * Encrypts the pages already in the graph or collection, after showing which ones it would encrypt
 * and which it leaves, and why. `blocked`: why it can't be used yet (lib/encryption-rules.ts).
 */
function EncryptExistingDialog({
  kind,
  label,
  containerId,
  blocked,
}: {
  kind: "graph" | "collection";
  label: string;
  containerId: string;
  blocked?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<BulkEncryptionResult | null>(null);
  const [pending, start] = useTransition();
  const n = plan?.pages?.length ?? 0;
  const pages = `${n.toLocaleString("en-US")} ${n === 1 ? "page" : "pages"}`;
  const skipped = plan?.skipped ?? [];

  // Back from fixing a page in another tab: check again.
  useEffect(() => {
    if (!open) return;
    const again = () => preview(true);
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  });

  function preview(keep = false) {
    if (!keep) setPlan(null);
    start(async () => {
      const res = await encryptExistingPages(kind, containerId, { preview: true });
      if (!res.ok) {
        toast.error(res.message);
        return setOpen(false);
      }
      setPlan(res);
    });
  }

  function encrypt() {
    start(async () => {
      const res = await encryptExistingPages(kind, containerId);
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) preview();
        }}
      >
        <DialogTrigger
          render={
            <Button type="button" variant="link" size="sm" className="self-start px-0" disabled={!!blocked}>
              <EncryptedIcon /> Encrypt existing pages…
            </Button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="break-words">Encrypt existing pages in {label}?</DialogTitle>
            <DialogDescription>
              {!plan
                ? "Checking which pages can be encrypted…"
                : n
                  ? `${pages} already here will be stored encrypted with the password of every place ${n === 1 ? "it's" : "they're"} shown. Readers open ${n === 1 ? "it" : "them"} with the same password. What changes:`
                  : `None of the pages here can be encrypted right now.`}
            </DialogDescription>
          </DialogHeader>
          {plan && n > 0 && <EncryptConsequences />}
          {plan && skipped.length > 0 && (
            <SkippedList skipped={skipped} still="readable">
              Pages are only encrypted where every place shows them with a password. Open one to set it to Password in
              Manage, then come back and encrypt.
            </SkippedList>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending && !!plan}>
              Cancel
            </Button>
            <Button type="button" onClick={encrypt} disabled={pending || !n}>
              <EncryptedIcon /> {pending && plan ? "Encrypting…" : n ? `Encrypt ${pages}` : "Encrypt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {blocked && <FieldDescription>{blocked}</FieldDescription>}
    </div>
  );
}

/** Pages a bulk change leaves as they are, each linking to its page with Manage open when it can. */
function SkippedList({ skipped, still, children }: { skipped: SkippedPage[]; still: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">
        {skipped.length.toLocaleString("en-US")} {skipped.length === 1 ? "page stays" : "pages stay"} {still}
      </p>
      <ul className="max-h-40 divide-y overflow-y-auto rounded-sm border text-sm">
        {skipped.map((p, i) => (
          <li key={i}>
            {p.manageHref ? (
              <a
                href={p.manageHref}
                target="_blank"
                rel="noopener"
                className="group flex items-center gap-2 px-3 py-2 hover:bg-muted"
                title="Open the page with Manage, in a new tab"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="break-words text-link group-hover:underline">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{p.reason}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  Manage <ExternalLinkIcon className="size-3" />
                </span>
              </a>
            ) : (
              <div className="flex flex-col px-3 py-2">
                <span className="break-words">{p.title}</span>
                <span className="text-xs text-muted-foreground">{p.reason}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * Turns off encryption on the pages here that one password opens, after showing which ones it
 * opens and which it leaves encrypted (another password, or another member's page).
 */
function DecryptExistingDialog({ kind, label, containerId }: { kind: "graph" | "collection"; label: string; containerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<BulkEncryptionResult | null>(null);
  const [pending, start] = useTransition();
  const blocked = decryptExistingPagesBlocked(password);
  const n = plan?.pages?.length ?? 0;
  const pages = `${n.toLocaleString("en-US")} ${n === 1 ? "page" : "pages"}`;
  const skipped = plan?.skipped ?? [];

  function check() {
    start(async () => {
      const res = await decryptExistingPages(kind, containerId, password, { preview: true });
      if (!res.ok) return void toast.error(res.message);
      setPlan(res);
    });
  }

  function decrypt() {
    start(async () => {
      const res = await decryptExistingPages(kind, containerId, password);
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
        setPassword("");
        setPlan(null);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="link" size="sm" className="self-start px-0">
            <LockOpenIcon /> Decrypt existing pages…
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (blocked || pending) return;
            if (plan && n) decrypt();
            else check();
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">Decrypt pages in {label}?</DialogTitle>
            <DialogDescription>
              Enter the password the pages are encrypted with. Every page here it opens is stored readable again; pages
              encrypted with a different password stay encrypted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${kind}-decrypt-password`} className="text-sm font-medium">
              Password
            </label>
            <Input
              id={`${kind}-decrypt-password`}
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPlan(null);
              }}
            />
          </div>
          {plan && (
            <p className="text-sm">
              {n
                ? `It opens ${pages}. Decrypting ${n === 1 ? "it" : "them"} keeps who can read ${n === 1 ? "it" : "them"} as it is, but roam.pub can read ${n === 1 ? "it" : "them"} again, and search, tags, related pages and excerpts come back.`
                : "That password doesn't open any of the encrypted pages here."}
            </p>
          )}
          {plan && skipped.length > 0 && (
            <SkippedList skipped={skipped} still="encrypted">
              Decrypt them with their own password here, or one by one in Manage on the dashboard.
            </SkippedList>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending && !!plan}>
              Cancel
            </Button>
            {plan && n ? (
              <Button type="submit" variant="destructive" disabled={pending}>
                <LockOpenIcon /> {pending ? "Decrypting…" : `Decrypt ${pages}`}
              </Button>
            ) : (
              <Button type="submit" disabled={pending || !!blocked}>
                {pending ? "Checking…" : "Check pages"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
