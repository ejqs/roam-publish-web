import { and, count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { graph, publication } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { lockKeyOf, sealedPageTitles } from "@/lib/encryption";
import { GraphAccessForm } from "./access-form";
import { GraphListingForm } from "../settings/settings-form";
import { graphPagesPath } from "@/lib/dashboard-filters";
import { ResourceHeader, resourceTabs } from "../../section-tabs";
import { PinCard } from "@/components/manage/pin-card";
import { frontPageLink, pinBlocked } from "@/lib/pin-rules";
import { pinOf } from "@/lib/pins";

export const metadata: Metadata = { title: "Graph sharing · Roam Publish" };

export default async function GraphSharingPage(props: PageProps<"/dashboard/[graph]/sharing">) {
  const { graph: graphName } = await props.params;
  const name = decodeURIComponent(graphName);
  const session = await requireSession(`/dashboard/${graphName}/sharing`);
  const g = await db.query.graph.findFirst({
    where: and(eq(graph.name, name), eq(graph.userId, session.user.id)),
  });
  if (!g) notFound();
  const [pages] = await db.select({ n: count() }).from(publication).where(eq(publication.graphId, g.id));
  const pin = await pinOf({ kind: "front", graphId: g.id });
  const pinned = pinBlocked(frontPageLink(g.name), pin);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-12">
      <ResourceHeader
        name={g.name}
        caption="The visibility of this graph's pages. Each page can change its own, from Manage or the Pages tab."
        tabs={resourceTabs(graphPagesPath(g.name), true, true)}
        current={`${graphPagesPath(g.name)}/sharing`}
      />
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <PinCard
          title="Front page link"
          path={`/${encodeURIComponent(g.name)}`}
          target={{ kind: "front", graphId: g.id }}
          pin={pin}
          blocks={`It can't be turned off or moved to Password or Members while it's pinned, its password stays as it is, and ${g.name} can't be deleted.`}
        />
        <GraphAccessForm
          pinned={pinned}
          graphId={g.id}
          graphName={g.name}
          pageCount={pages?.n ?? 0}
          initial={{
            indexAccess: g.indexAccess,
            defaultAccess: g.defaultAccess,
            hasPassword: !!g.passwordHash,
            canEncrypt: !!g.passwordHash && !!(await lockKeyOf(db, { scope: "graph", id: g.id })),
            encryptNewPages: g.encryptNewPages,
          }}
          encryptedPages={await sealedPageTitles({ scope: "graph", id: g.id })}
        />
        <GraphListingForm
          graphId={g.id}
          graphName={g.name}
          indexOpen={g.indexAccess === "open"}
          initial={{ frontPage: g.frontPage, indexable: g.indexable, searchListed: g.searchListed }}
          pinned={pinned}
        />
      </div>
    </div>
  );
}
