"use client";

import { useEffect } from "react";

/**
 * Reports a view once per browser per publication. The flag is only set after a signed-in request
 * was handled (202), so reading signed out and later signed in still counts. Signed-out requests
 * exit on the server before any database work.
 */
export function ViewBeacon({ publicationId }: { publicationId: string }) {
  useEffect(() => {
    const key = `rp:viewed:${publicationId}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return; // Storage blocked: skip rather than send on every load.
    }
    fetch("/api/views", { method: "POST", body: publicationId, keepalive: true })
      .then((res) => {
        if (res.status === 202) localStorage.setItem(key, "1");
      })
      .catch(() => {});
  }, [publicationId]);
  return null;
}
