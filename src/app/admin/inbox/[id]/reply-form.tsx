"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { type ActionState, replyToInboxEmail } from "../actions";

export function ReplyForm({ emailId }: { emailId: string }) {
  const [body, setBody] = useState("");
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const res = await replyToInboxEmail(prev, formData);
    if (res?.ok) {
      toast.success(res.message);
      setBody("");
    }
    return res;
  }, null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="emailId" value={emailId} />
      <Textarea
        name="body"
        aria-label="Reply"
        rows={8}
        maxLength={10_000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
      />
      <FieldDescription>Sent from roam.pub with the original quoted below it. Replies to it come back here.</FieldDescription>
      {state && !state.ok && <FieldError>{state.message}</FieldError>}
      <Button type="submit" className="self-start" disabled={pending || !body.trim()}>
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </form>
  );
}
