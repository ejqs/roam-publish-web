"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runJobNow } from "@/server/actions/admin/jobs";

export function RunNowButton({ name, disabled }: { name: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const res = await runJobNow(name);
          (res.ok ? toast.success : toast.error)(res.message);
          // Give the worker a moment, then show what it did.
          if (res.ok) setTimeout(() => router.refresh(), 6_000);
        })
      }
    >
      {pending ? "Queuing…" : "Run now"}
    </Button>
  );
}
