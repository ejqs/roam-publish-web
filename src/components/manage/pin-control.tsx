"use client";

import { BanIcon, CheckIcon, PinIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { type Pin, PIN_MAX_PLACES, type PinTarget, parseSharedAt, sharedAtText, shortPlace } from "@/lib/pin-rules";
import { pinLink, unpinLink } from "@/server/actions/pins";

/**
 * A link's pin, under the link wherever it's shown with its settings (a page's place in Manage, a
 * front page, a collection's page): "Pin link…" when it isn't pinned, or where it's shared, with Edit
 * places and Unpin, when it is. `blocks` says what the pin refuses here, in a sentence.
 */
export function PinControl({
  target,
  pin,
  url,
  blocks,
  canChange,
  onChanged,
}: {
  target: PinTarget;
  pin: Pin | null;
  /** The link itself, shown in the dialog. */
  url: string;
  blocks: string;
  canChange: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const done = () => (onChanged ? onChanged() : router.refresh());

  if (!pin)
    return canChange ? (
      <>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PinIcon /> Pin link…
          </Button>
          <span className="text-xs text-muted-foreground">Shared it somewhere? Pin it so it can&apos;t break by accident.</span>
        </div>
        <PinDialog open={editing} onOpenChange={setEditing} target={target} url={url} blocks={blocks} onSaved={done} />
      </>
    ) : null;

  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-l-[3px] border-l-primary bg-primary/5 p-3 text-xs">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <PinIcon className="size-3.5 text-primary" />
        Pinned: you&apos;ve shared this link in {pin.sharedAt.length === 1 ? "1 place" : `${pin.sharedAt.length} places`}
      </p>
      <ul className="flex flex-col gap-0.5 pl-5">
        {pin.sharedAt.map((u) => (
          <li key={u} className="list-disc truncate">
            <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="text-link hover:underline">
              {shortPlace(u)}
            </a>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">{blocks}</p>
      {canChange && (
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(true)}>
            Edit places
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Unpin this link? You've shared it at ${sharedAtText(pin)}, and anything you change could break it there.`)) return;
              start(async () => {
                const res = await unpinLink(target);
                if (res.ok) toast.success(res.message);
                else toast.error(res.message);
                done();
              });
            }}
          >
            Unpin
          </Button>
        </div>
      )}
      <PinDialog open={editing} onOpenChange={setEditing} target={target} url={url} blocks={blocks} pin={pin} onSaved={done} />
    </div>
  );
}

function PinDialog({
  open,
  onOpenChange,
  target,
  url,
  blocks,
  pin,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: PinTarget;
  url: string;
  blocks: string;
  pin?: Pin;
  onSaved: () => void;
}) {
  const [text, setText] = useState(pin ? pin.sharedAt.join("\n") : "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const parsed = parseSharedAt(text);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setText(pin ? pin.sharedAt.join("\n") : "");
          setError("");
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if ("error" in parsed) return setError(parsed.error);
            start(async () => {
              const res = await pinLink(target, text);
              if (!res.ok) return setError(res.message);
              toast.success(res.message);
              onOpenChange(false);
              onSaved();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{pin ? "Where it's shared" : "Pin this link"}</DialogTitle>
            <DialogDescription className="break-all">{url}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pin-places" className="text-sm font-medium">
              Where have you shared it?
            </label>
            <Textarea
              id="pin-places"
              autoFocus
              rows={3}
              className="font-mono text-xs"
              placeholder={"https://x.com/you/status/…\nhttps://yourblog.com/post"}
              value={text}
              aria-invalid={!!error}
              onChange={(e) => {
                setText(e.target.value);
                setError("");
              }}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              One link per line, up to {PIN_MAX_PLACES}. Only you and people who manage this link see them.
            </p>
          </div>
          {!pin && (
            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex gap-2">
                <BanIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>{blocks} The message says where it&apos;s shared, here and in Roam.</span>
              </li>
              <li className="flex gap-2">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Republishing, renaming the page and switching between Discover, Public and Unlisted still work.</span>
              </li>
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !text.trim()}>
              <PinIcon /> {pin ? "Save" : "Pin link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
