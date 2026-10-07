"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { answerInvite } from "../member-actions";

export function InviteActions({ inviteId, disabled }: { inviteId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const answer = (accept: boolean) =>
    start(async () => {
      const res = await answerInvite(inviteId, accept);
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message);
      router.refresh();
    });
  return (
    <div className="flex gap-2">
      <Button disabled={pending || disabled} onClick={() => answer(true)}>
        Accept
      </Button>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => confirm("Decline it? If you change your mind, they'd need to send a new one.") && answer(false)}
      >
        Decline
      </Button>
    </div>
  );
}
