"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { applyAccessToAllPages } from "@/app/(app)/dashboard/place-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldDescription, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Access } from "@/db/schema";
import { ACCESS_DESCRIPTIONS, ACCESS_LABELS, Choice } from "./choice";

export type ContainerAccess = {
  indexAccess: Access;
  defaultAccess: Access;
  /** A new password, or "" to keep the current one. */
  password: string;
  clearPassword: boolean;
};

const options = (what: string) =>
  (["open", "password", "members"] as const).map((a) => ({
    value: a,
    label: ACCESS_LABELS[a],
    description: a === "open" ? `Anyone can ${what}.` : ACCESS_DESCRIPTIONS[a],
  }));

/**
 * A graph's or collection's two access settings: who can open its front page, and what new pages
 * start as. Both share one password. The page default never changes existing pages; "Apply to
 * existing pages" does that explicitly.
 */
export function ContainerAccessFields({
  kind,
  containerId,
  pageCount,
  value,
  hasPassword,
  onChange,
}: {
  kind: "graph" | "collection";
  containerId: string;
  pageCount: number;
  value: ContainerAccess;
  /** Saved password, not the one being typed. */
  hasPassword: boolean;
  onChange: (v: ContainerAccess) => void;
}) {
  const set = (patch: Partial<ContainerAccess>) => onChange({ ...value, ...patch });
  const usesPassword = value.indexAccess === "password" || value.defaultAccess === "password";
  const willHavePassword = value.password ? true : value.clearPassword ? false : hasPassword;
  return (
    <>
      <FieldSet>
        <FieldLegend variant="label">Front page</FieldLegend>
        <FieldDescription>Who can open this {kind}&apos;s page and see what&apos;s listed on it.</FieldDescription>
        <Choice id={`${kind}-index`} value={value.indexAccess} options={options("open it")} onChange={(indexAccess) => set({ indexAccess, defaultAccess: indexAccess })} />
      </FieldSet>
      <FieldSeparator />
      <FieldSet>
        <FieldLegend variant="label">New pages start as</FieldLegend>
        <FieldDescription>
          Pages {kind === "graph" ? "published" : "added"} from now on. Changing this doesn&apos;t change pages already
          here, and each page can be changed on its own. Protected pages are never listed on Discover.
        </FieldDescription>
        <Choice id={`${kind}-default`} value={value.defaultAccess} options={options("read them")} onChange={(defaultAccess) => set({ defaultAccess })} />
        {pageCount > 0 && (
          <ApplyToPagesDialog
            kind={kind}
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
            : "Changing it signs out everyone who unlocked with the old one. Pages with their own password keep it."}
        </FieldDescription>
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
  containerId,
  pageCount,
  initial,
  hasPassword,
}: {
  kind: "graph" | "collection";
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
            password keep it.
          </DialogDescription>
        </DialogHeader>
        <Choice
          id={`${kind}-apply`}
          value={access}
          options={options("read them").map((o) =>
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
