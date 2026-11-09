"use client";

import { useEffect } from "react";

/**
 * Links made before What's new had pages point at /updates#entry-id. When that entry isn't on this page, ask the
 * server for the page that has it.
 */
export function HashJump() {
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!/^(web|ext)-[0-9a-f]{12}$/.test(id) || document.getElementById(id)) return;
    const q = new URLSearchParams(location.search);
    if (q.get("entry") === id) return; // Already asked: it's gone, or filtered out.
    q.delete("page");
    q.set("entry", id);
    location.replace(`/updates?${q}#${id}`);
  }, []);
  return null;
}
