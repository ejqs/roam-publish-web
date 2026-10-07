"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ModerationNotice, moderationEmail } from "@/lib/moderation-email-templates";
import { type ActionState, type ModerationOp, moderate } from "@/server/actions/admin/moderation";

const COPY: Record<ModerationOp, { title: string; confirm: string; destructive: boolean }> = {
  remove: { title: "Remove page", confirm: "Remove page", destructive: true },
  restore: { title: "Restore page", confirm: "Restore", destructive: false },
  suspend: { title: "Suspend graph", confirm: "Suspend graph", destructive: true },
  unsuspend: { title: "Lift graph suspension", confirm: "Lift suspension", destructive: false },
  ban: { title: "Ban user", confirm: "Ban user", destructive: true },
  unban: { title: "Unban user", confirm: "Unban", destructive: false },
  dismiss: { title: "Dismiss reports", confirm: "Dismiss", destructive: false },
};

/**
 * One confirm dialog for every moderation action. `notice` drives the owner email preview;
 * leave it out for actions that never email (dismiss).
 */
export function ModerateDialog({
  op,
  targetId,
  targetType,
  subject,
  description,
  notice,
  replyTo,
  size = "sm",
}: {
  op: ModerationOp;
  targetId: string;
  targetType?: "publication" | "graph" | "profile" | "collection";
  /** What's being acted on, e.g. a page title or email. */
  subject: string;
  description: string;
  notice?: ModerationNotice;
  replyTo?: string;
  size?: "sm" | "default";
}) {
  const copy =
    targetType === "collection" && (op === "suspend" || op === "unsuspend")
      ? {
          ...COPY[op],
          title: COPY[op].title.replace("graph", "collection"),
          confirm: COPY[op].confirm.replace("graph", "collection"),
        }
      : COPY[op];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const res = await moderate(prev, formData);
    if (res?.ok) {
      toast.success(res.message);
      setOpen(false);
      setReason("");
    }
    return res;
  }, null);
  const needsReason = op === "remove" || op === "suspend" || op === "ban";

  const preview = notice && moderationEmail(notice, reason || "…", replyTo);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={copy.destructive ? "destructive" : "outline"} size={size}>
            {copy.confirm}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form action={action} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {copy.title}: <span className="break-all">{subject}</span>
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="op" value={op} />
          <input type="hidden" name="targetId" value={targetId} />
          {targetType && <input type="hidden" name="targetType" value={targetType} />}
          {notice && (
            <>
              <Field>
                <FieldLabel htmlFor={`reason-${op}-${targetId}`}>
                  Reason shown to the owner{needsReason ? "" : " (optional)"}
                </FieldLabel>
                <Textarea
                  id={`reason-${op}-${targetId}`}
                  name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required={needsReason}
                  maxLength={2000}
                  rows={3}
                />
                <FieldDescription>Saved to the audit log and shown on the owner&apos;s dashboard.</FieldDescription>
              </Field>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox name="notify" checked={notify} onCheckedChange={(v) => setNotify(!!v)} />
                Email the owner
              </Label>
              {notify && preview && (
                <div className="rounded-sm border bg-muted/50 p-3 text-xs">
                  <p className="mb-2 font-medium">{preview.subject}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{preview.text}</p>
                </div>
              )}
            </>
          )}
          {state && !state.ok && <FieldError>{state.message}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={copy.destructive ? "destructive" : "default"}
              disabled={pending || (needsReason && !reason.trim())}
            >
              {pending ? "Working…" : copy.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
