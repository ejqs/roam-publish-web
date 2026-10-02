"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { moveEntry } from "../actions";

/** Up and down for the owner's order of pages in a collection. */
export function EntryReorder({ entryId, first, last }: { entryId: string; first: boolean; last: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const move = (direction: -1 | 1) =>
    start(async () => {
      const res = await moveEntry(entryId, direction);
      if (!res.ok) toast.error(res.message);
      router.refresh();
    });
  return (
    <span className="inline-flex">
      <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={pending || first} onClick={() => move(-1)}>
        <ArrowUpIcon />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={pending || last} onClick={() => move(1)}>
        <ArrowDownIcon />
      </Button>
    </span>
  );
}
