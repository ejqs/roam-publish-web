"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_TONES, moderationAction } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { endAnnouncement, MESSAGE_MAX, muteAnnouncement, postAnnouncement } from "@/lib/announcements";
import { withAction } from "@/lib/telemetry";
import type { ActionState } from "../actions";

const HOUR = 60 * 60_000;
export type Duration = "1h" | "6h" | "1d" | "3d" | "7d";
const DURATIONS: Record<Duration, number> = { "1h": HOUR, "6h": 6 * HOUR, "1d": 24 * HOUR, "3d": 72 * HOUR, "7d": 168 * HOUR };
/** How long Mute hides an automatic banner. */
const MUTE_MS = 6 * HOUR;

/** A link on this site ("/updates") or a web address: nothing a click could run. */
const Link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || (v.startsWith("/") && !v.startsWith("//")) || /^https?:\/\/[^\s]+$/i.test(v), {
    message: "Use a web address (https://…) or a path on this site (/…).",
  });

const Input = z.object({
  tone: z.enum(ANNOUNCEMENT_TONES),
  message: z.string().trim().min(1, "Write the announcement.").max(MESSAGE_MAX, `Keep it to ${MESSAGE_MAX} characters.`),
  linkUrl: Link,
  linkText: z.string().trim().max(40),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  duration: z.enum(Object.keys(DURATIONS) as [Duration, ...Duration[]]),
});

async function log(adminId: string, targetId: string, action: "announce" | "end_announcement" | "mute" | "unmute", reason: string) {
  await db.insert(moderationAction).values({ adminId, targetType: "announcement", targetId, action, reason });
}

function done(message: string): ActionState {
  revalidatePath("/", "layout");
  return { ok: true, message };
}

export async function postAnnouncementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return withAction("admin.announcement.post", async () => {
    const admin = await requireAdmin();
    const parsed = Input.safeParse(Object.fromEntries(["tone", "message", "linkUrl", "linkText", "audience", "duration"].map((k) => [k, formData.get(k) ?? ""])));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
    const { duration, linkUrl, linkText, ...rest } = parsed.data;
    const now = new Date();
    const row = await postAnnouncement(
      {
        ...rest,
        linkUrl: linkUrl || null,
        linkText: linkUrl ? linkText || null : null,
        endsAt: new Date(now.getTime() + DURATIONS[duration]),
        createdBy: admin.user.id,
      },
      now,
    );
    await log(admin.user.id, row.id, "announce", `${row.tone}, ${row.audience}: ${row.message}`);
    return done("Announcement posted.");
  });
}

export async function endAnnouncementAction(id: string): Promise<ActionState> {
  return withAction("admin.announcement.end", async () => {
    const admin = await requireAdmin();
    const row = await endAnnouncement(id);
    if (!row) return { ok: false, message: "It has already ended." };
    await log(admin.user.id, id, "end_announcement", row.message);
    return done(row.source === "auto" ? "Taken down. It comes back if the problem is still there." : "Taken down.");
  });
}

export async function muteAnnouncementAction(id: string, mute: boolean): Promise<ActionState> {
  return withAction("admin.announcement.mute", async () => {
    const admin = await requireAdmin();
    const row = await muteAnnouncement(id, mute ? new Date(Date.now() + MUTE_MS) : null);
    if (!row) return { ok: false, message: "That announcement is gone." };
    await log(admin.user.id, id, mute ? "mute" : "unmute", row.key ?? row.message);
    return done(mute ? "Muted for 6 hours." : "Unmuted.");
  });
}
