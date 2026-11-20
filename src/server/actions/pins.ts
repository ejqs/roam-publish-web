"use server";

import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import type { PinTarget } from "@/lib/pin-rules";
import { mayChangePin, PIN_NOT_ALLOWED, type PinResult, removePin, savePin } from "@/lib/pin-writes";
import { withAction } from "@/lib/telemetry";

export type { PinResult } from "@/lib/pin-writes";

const Target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("page"), publicationId: z.string() }),
  z.object({ kind: z.literal("entry"), entryId: z.string() }),
  z.object({ kind: z.literal("front"), graphId: z.string() }),
  z.object({ kind: z.literal("collection"), collectionId: z.string() }),
]);

async function userId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/** Pins a link, or changes where it says it's shared. `places` is the pasted text, one URL per line. */
export async function pinLink(raw: PinTarget, places: string): Promise<PinResult> {
  return withAction("dashboard.pins.pinLink", async () => {
    const uid = await userId();
    if (!uid) return { ok: false, message: "Your session expired. Please log in again." };
    const parsed = Target.safeParse(raw);
    if (!parsed.success || typeof places !== "string" || places.length > 30_000) return PIN_NOT_ALLOWED;
    if (!(await mayChangePin(uid, parsed.data))) return PIN_NOT_ALLOWED;
    return savePin(uid, parsed.data, places);
  });
}

/** Unpins a link: everything it refused works again. */
export async function unpinLink(raw: PinTarget): Promise<PinResult> {
  return withAction("dashboard.pins.unpinLink", async () => {
    const uid = await userId();
    if (!uid) return { ok: false, message: "Your session expired. Please log in again." };
    const parsed = Target.safeParse(raw);
    if (!parsed.success) return PIN_NOT_ALLOWED;
    if (!(await mayChangePin(uid, parsed.data))) return PIN_NOT_ALLOWED;
    return removePin(parsed.data);
  });
}
