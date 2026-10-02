import { clientIp, rateLimit } from "@/lib/rate-limit";
import { searchPages } from "@/lib/site-search";
import { plainText } from "@/lib/slug";

export type QuickResult = { title: string; href: string; source: string; tags: string[] };

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** Top matches for quick search, from the same publicly listed pages as /search. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  if (!q) return json({ results: [] });
  if (!rateLimit(`quick-search:ip:${clientIp(req)}`, 120, 60 * 1000)) return json({ error: "Too many searches" }, 429);
  const { rows } = await searchPages({ q, tags: [], sort: "best", page: 1 });
  const results: QuickResult[] = rows.slice(0, 6).map((r) => ({
    title: plainText(r.title) || "Untitled",
    href: r.href,
    source: r.source.label,
    tags: r.tags.slice(0, 4),
  }));
  return json({ results });
}
