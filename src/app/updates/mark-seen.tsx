"use client";

import { useEffect } from "react";
import { writeSeenCookie } from "@/lib/whats-new-shared";

/** Records this visit, so the dot goes away and next time's "new" starts from here. */
export function MarkSeen({ value }: { value: string | null }) {
  useEffect(() => {
    if (value) writeSeenCookie(value);
  }, [value]);
  return null;
}
