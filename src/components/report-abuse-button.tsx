"use client";

import { FlagIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { type ReportState, submitReport } from "@/app/report/actions";
import { REPORT_REASONS } from "@/lib/report-reasons";

export type ReportTarget =
  | { graphName: string; rootUid?: string }
  | { username: string }
  | { collectionSlug: string; entryUid?: string };

/** Top-right "Report abuse" for a published page, a whole graph, or a user's profile. */
export function ReportAbuseButton({ target }: { target: ReportTarget }) {
  const what =
    "username" in target
      ? "this profile"
      : "collectionSlug" in target
        ? target.entryUid
          ? "this page"
          : "this collection"
        : target.rootUid
          ? "this page"
          : "this graph";
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ReportState, formData: FormData) => {
    const res = await submitReport(prev, formData);
    if (res?.ok) {
      toast.success(res.message);
      setOpen(false);
    }
    return res;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <FlagIcon />
            Report abuse
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form action={action} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Report {what}</DialogTitle>
            <DialogDescription>
              Tell us what&apos;s wrong. Reports are reviewed by the roam.pub moderators and are not
              shared with the author.
            </DialogDescription>
          </DialogHeader>
          {"username" in target ? (
            <input type="hidden" name="username" value={target.username} />
          ) : "collectionSlug" in target ? (
            <>
              <input type="hidden" name="collectionSlug" value={target.collectionSlug} />
              {target.entryUid && <input type="hidden" name="entryUid" value={target.entryUid} />}
            </>
          ) : (
            <>
              <input type="hidden" name="graphName" value={target.graphName} />
              {target.rootUid && <input type="hidden" name="rootUid" value={target.rootUid} />}
            </>
          )}
          {/* Honeypot for bots; hidden from people and assistive tech. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />
          <RadioGroup name="reason" className="gap-2" required>
            {Object.entries(REPORT_REASONS).map(([value, label]) => (
              <Label key={value} className="flex items-center gap-2 font-normal">
                <RadioGroupItem value={value} aria-label={label} />
                {label}
              </Label>
            ))}
          </RadioGroup>
          <Field>
            <FieldLabel htmlFor="report-details">Details</FieldLabel>
            <Textarea id="report-details" name="details" maxLength={2000} rows={3} />
            <FieldDescription>Optional. What should we look at?</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="report-email">Your email</FieldLabel>
            <Input id="report-email" name="email" type="email" autoComplete="email" />
            <FieldDescription>Optional, in case we need to follow up.</FieldDescription>
          </Field>
          {state && !state.ok && <FieldError>{state.message}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
