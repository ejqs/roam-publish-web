"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { endAnnouncementAction, muteAnnouncementAction } from "@/server/actions/admin/announcements";

export function RowButtons({ id, muted, auto }: { id: string; muted: boolean; auto: boolean }) {
  const [pending, start] = useTransition();
  const run = (fn: () => ReturnType<typeof endAnnouncementAction>) =>
    start(async () => {
      const res = await fn();
      if (res) (res.ok ? toast.success : toast.error)(res.message);
    });
  return (
    <div className="flex flex-wrap gap-2">
      {auto && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => muteAnnouncementAction(id, !muted))}>
          {muted ? "Unmute" : "Mute 6 h"}
        </Button>
      )}
      {!auto && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => confirm("Take this announcement down for everyone?") && run(() => endAnnouncementAction(id))}
        >
          Take down
        </Button>
      )}
    </div>
  );
}
