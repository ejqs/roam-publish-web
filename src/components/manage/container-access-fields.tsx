"use client";

import { Button } from "@/components/ui/button";
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
 * A graph's or collection's two access settings: who can open its front page, and what its pages
 * use unless they set their own. Both share one password.
 */
export function ContainerAccessFields({
  kind,
  value,
  hasPassword,
  onChange,
}: {
  kind: "graph" | "collection";
  value: ContainerAccess;
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
        <Choice id={`${kind}-index`} value={value.indexAccess} options={options("open it")} onChange={(indexAccess) => set({ indexAccess })} />
      </FieldSet>
      <FieldSeparator />
      <FieldSet>
        <FieldLegend variant="label">Pages, by default</FieldLegend>
        <FieldDescription>
          Each page can override this, for example to share one page openly from a protected {kind}. Protected pages
          are never listed on Discover.
        </FieldDescription>
        <Choice id={`${kind}-default`} value={value.defaultAccess} options={options("read them")} onChange={(defaultAccess) => set({ defaultAccess })} />
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
