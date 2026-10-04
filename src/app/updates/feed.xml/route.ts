import { rssResponse } from "@/lib/feeds";
import { withRoute } from "@/lib/telemetry";
import { KIND_LABEL, plainChange, SOURCE_LABEL, whatsNew } from "@/lib/whats-new";

const TITLE_MAX = 90;

export const GET = withRoute("GET /updates/feed.xml", async () => {
  const entries = (await whatsNew()).slice(0, 100);
  return rssResponse({
    title: "What's new · Roam Publish",
    path: "/updates",
    selfPath: "/updates/feed.xml",
    description: "Changes to roam.pub and the Roam Publish extension.",
    items: entries.map((e) => {
      const text = plainChange(e.text);
      const label = e.kind ? `${SOURCE_LABEL[e.source]} · ${KIND_LABEL[e.kind]}` : SOURCE_LABEL[e.source];
      return {
        title: `${label}: ${text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text}`,
        path: `/updates#${e.id}`,
        date: e.stampedAt,
        category: e.area || undefined,
        description: text,
      };
    }),
  });
});
