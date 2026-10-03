import { describe, expect, test } from "bun:test";
import { type Announcement, dismissId, pickAnnouncement } from "@/lib/announcements";

const NOW = new Date("2026-10-03T12:00:00Z");
const min = (m: number) => new Date(NOW.getTime() + m * 60_000);

function ann(over: Partial<Announcement>): Announcement {
  return {
    id: crypto.randomUUID(),
    source: "manual",
    key: null,
    tone: "warning",
    message: "m",
    linkUrl: null,
    linkText: null,
    audience: "everyone",
    startsAt: min(-10),
    endsAt: min(60),
    mutedUntil: null,
    createdBy: null,
    updatedAt: min(-10),
    ...over,
  };
}

const pick = (rows: Announcement[], opts: { signedIn?: boolean; dismissed?: string } = {}) =>
  pickAnnouncement(rows, { signedIn: opts.signedIn ?? false, dismissed: opts.dismissed, now: NOW });

describe("pickAnnouncement", () => {
  test("nothing live: nothing", () => {
    expect(pick([ann({ endsAt: min(-1) }), ann({ startsAt: min(5) })])).toBeNull();
  });

  test("critical beats warning; at the same tone an admin's beats an automatic one", () => {
    const manualWarn = ann({ message: "manual warning" });
    const autoCrit = ann({ source: "auto", key: "publishing", tone: "critical", message: "auto critical" });
    const autoWarn = ann({ source: "auto", key: "email", message: "auto warning" });
    const manualCrit = ann({ tone: "critical", message: "manual critical" });
    expect(pick([manualWarn, autoCrit])?.message).toBe("auto critical");
    expect(pick([autoWarn, manualWarn])?.message).toBe("manual warning");
    expect(pick([autoCrit, manualCrit, manualWarn])?.message).toBe("manual critical");
  });

  test("signed-in only banners skip readers", () => {
    const a = ann({ audience: "signed-in" });
    expect(pick([a])).toBeNull();
    expect(pick([a], { signedIn: true })?.id).toBe(a.id);
  });

  test("a muted banner is hidden until the mute runs out", () => {
    expect(pick([ann({ mutedUntil: min(30) })])).toBeNull();
    expect(pick([ann({ mutedUntil: min(-1) })])).not.toBeNull();
  });

  test("a dismissed warning stays hidden; a critical one can't be dismissed", () => {
    const warn = ann({});
    const crit = ann({ tone: "critical" });
    expect(pick([warn], { dismissed: dismissId(warn) })).toBeNull();
    expect(pick([crit], { dismissed: dismissId(crit) })?.id).toBe(crit.id);
  });

  test("dismissing an automatic banner lasts one incident", () => {
    const first = ann({ source: "auto", key: "publishing" });
    const next = { ...first, startsAt: min(-1) };
    expect(dismissId(first)).not.toBe(dismissId(next));
    expect(pick([next], { dismissed: dismissId(first) })).not.toBeNull();
  });
});
