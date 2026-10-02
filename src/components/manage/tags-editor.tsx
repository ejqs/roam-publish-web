"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A page's tags in the Manage dialog. Tags from the Roam text can be removed here and stay removed
 * on republish; tags added here are kept too.
 */
export function TagsEditor({
  tags,
  hidden,
  pending,
  onChange,
}: {
  tags: { name: string; added: boolean }[];
  hidden: string[];
  pending: boolean;
  onChange: (change: { add?: string[]; remove?: string[] }) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    // Commas add several at once: "essay, book club".
    const names = draft
      .split(",")
      .map((t) => t.trim().replace(/^#+/, ""))
      .filter(Boolean);
    if (!names.length) return;
    onChange({ add: names });
    setDraft("");
  };
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">Tags</h3>
      {tags.length === 0 ? (
        <p className="text-muted-foreground">No tags. Add #tags or Tags:: in Roam, or add them here.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {tags.map((t) => (
            <li
              key={t.name}
              className="inline-flex h-6 items-center gap-1 rounded-4xl border pr-0.5 pl-2 text-xs text-roam-ref"
              title={t.added ? "Added on the website" : "From the page's text in Roam"}
            >
              #{t.name}
              {t.added && <span className="text-muted-foreground">· added here</span>}
              <button
                type="button"
                disabled={pending}
                onClick={() => onChange({ remove: [t.name] })}
                aria-label={`Remove tag ${t.name}`}
                className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a tag"
          aria-label="Add a tag"
          maxLength={200}
          className="h-8"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending || !draft.trim()}>
          <PlusIcon /> Add
        </Button>
      </form>
      {hidden.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Hidden from Roam:{" "}
          {hidden.map((t, i) => (
            <span key={t}>
              {i > 0 && ", "}#{t}{" "}
              <button
                type="button"
                disabled={pending}
                onClick={() => onChange({ add: [t] })}
                className="text-link hover:underline disabled:opacity-50"
              >
                Restore
              </button>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
