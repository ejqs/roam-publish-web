"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { BannerView } from "@/components/banner-view";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import type { AnnouncementAudience, AnnouncementTone } from "@/db/app-schema";
import { MESSAGE_MAX } from "@/lib/announcement-shared";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import type { ActionState } from "@/server/actions/admin/moderation";
import { type Duration, postAnnouncementAction } from "@/server/actions/admin/announcements";

const PREVIEW_START = new Date(0);

export function AnnouncementForm() {
  const [tone, setTone] = useState<AnnouncementTone>("warning");
  const [audience, setAudience] = useState<AnnouncementAudience>("everyone");
  const [duration, setDuration] = useState<Duration>("7d");
  const [message, setMessage] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  useUnsavedChanges(!!(message.trim() || linkUrl.trim() || linkText.trim()));
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const res = await postAnnouncementAction(prev, formData);
    if (res?.ok) {
      toast.success(res.message);
      setMessage("");
      setLinkUrl("");
      setLinkText("");
    }
    return res;
  }, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tone" value={tone} />
      <input type="hidden" name="audience" value={audience} />
      <input type="hidden" name="duration" value={duration} />
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <Field className="w-auto">
          <FieldLabel id="ann-tone">Tone</FieldLabel>
          <SegmentedControl
            aria-labelledby="ann-tone"
            value={tone}
            onChange={setTone}
            options={[
              { value: "info", label: "Info" },
              { value: "warning", label: "Warning" },
              { value: "critical", label: "Critical" },
            ]}
          />
        </Field>
        <Field className="w-auto">
          <FieldLabel id="ann-audience">Who sees it</FieldLabel>
          <SegmentedControl
            aria-labelledby="ann-audience"
            value={audience}
            onChange={setAudience}
            options={[
              { value: "everyone", label: "Everyone" },
              { value: "signed-in", label: "Signed in" },
            ]}
          />
        </Field>
        <Field className="w-auto">
          <FieldLabel id="ann-duration">Ends after</FieldLabel>
          <SegmentedControl
            aria-labelledby="ann-duration"
            value={duration}
            onChange={setDuration}
            options={[
              { value: "1h", label: "1 hour" },
              { value: "6h", label: "6 hours" },
              { value: "1d", label: "1 day" },
              { value: "3d", label: "3 days" },
              { value: "7d", label: "7 days" },
            ]}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="ann-message">Message</FieldLabel>
        <Textarea
          id="ann-message"
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MESSAGE_MAX}
          rows={2}
          required
          placeholder="Scheduled maintenance Sun 5 Oct, 02:00–02:30 UTC. Published pages stay up; publishing from Roam will pause."
        />
        <FieldDescription>
          {message.length}/{MESSAGE_MAX}. {tone === "critical" ? "A critical banner can't be dismissed." : "People can dismiss it."}
        </FieldDescription>
      </Field>
      <div className="flex flex-wrap gap-4">
        <Field className="min-w-0 flex-[2_1_16rem]">
          <FieldLabel htmlFor="ann-link">Link (optional)</FieldLabel>
          <Input id="ann-link" name="linkUrl" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://… or /updates" />
        </Field>
        <Field className="min-w-0 flex-[1_1_10rem]">
          <FieldLabel htmlFor="ann-link-text">Link text</FieldLabel>
          <Input id="ann-link-text" name="linkText" value={linkText} onChange={(e) => setLinkText(e.target.value)} maxLength={40} placeholder="Details" />
        </Field>
      </div>
      {message.trim() && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Preview</span>
          <div className="overflow-hidden rounded-sm border">
            <BannerView
              preview
              announcement={{
                id: "preview",
                source: "manual",
                key: null,
                startsAt: PREVIEW_START,
                tone,
                message: message.trim(),
                linkUrl: linkUrl.trim() || null,
                linkText: linkText.trim() || null,
              }}
            />
          </div>
        </div>
      )}
      {state && !state.ok && <FieldError>{state.message}</FieldError>}
      <div>
        <Button type="submit" disabled={pending || !message.trim()}>
          {pending ? "Posting…" : "Post announcement"}
        </Button>
      </div>
    </form>
  );
}
