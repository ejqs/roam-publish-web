import { graphPath } from "@/lib/graphs";
import { collectionPath, publicationUrl } from "@/lib/publications";
import { plainText } from "@/lib/slug";
import { ModerateDialog } from "./moderate-dialog";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const replyTo = () => process.env.MODERATION_REPLY_TO || undefined;

type Pub = { id: string; rootUid: string; title: string; removedAt: Date | null };
type Graph = { id: string; name: string; suspendedAt: Date | null };
type Owner = { id: string; email: string; banned: boolean | null };

export function PublicationActions({ pub, graphName }: { pub: Pub; graphName: string }) {
  const title = plainText(pub.title) || "Untitled";
  const notice = { title, url: publicationUrl(graphName, pub.rootUid, pub.title) };
  return pub.removedAt ? (
    <ModerateDialog
      op="restore"
      targetId={pub.id}
      subject={title}
      description="The page becomes visible again and the owner can republish it."
      notice={{ kind: "page_restored", ...notice }}
      replyTo={replyTo()}
    />
  ) : (
    <ModerateDialog
      op="remove"
      targetId={pub.id}
      subject={title}
      description="Hides the page from everyone and stops the owner from republishing it. Open reports on it are marked actioned."
      notice={{ kind: "page_removed", ...notice }}
      replyTo={replyTo()}
    />
  );
}

export function GraphActions({ g }: { g: Graph }) {
  const notice = { graphName: g.name, url: appUrl() + graphPath(g.name) };
  return g.suspendedAt ? (
    <ModerateDialog
      op="unsuspend"
      targetId={g.id}
      subject={g.name}
      description="The graph's pages become visible again and its API key works again."
      notice={{ kind: "graph_restored", ...notice }}
      replyTo={replyTo()}
    />
  ) : (
    <ModerateDialog
      op="suspend"
      targetId={g.id}
      subject={g.name}
      description="Hides the graph and every page in it, and turns off publishing from it. All open reports on the graph are marked actioned."
      notice={{ kind: "graph_suspended", ...notice }}
      replyTo={replyTo()}
    />
  );
}

export function UserActions({ owner }: { owner: Owner }) {
  return owner.banned ? (
    <ModerateDialog
      op="unban"
      targetId={owner.id}
      subject={owner.email}
      description="The user can sign in and publish again, and their graphs become visible."
      notice={{ kind: "account_restored" }}
      replyTo={replyTo()}
    />
  ) : (
    <ModerateDialog
      op="ban"
      targetId={owner.id}
      subject={owner.email}
      description="Signs the user out everywhere, blocks sign-in and publishing, and hides all their graphs and their profile. All open reports on their graphs and profile are marked actioned."
      notice={{ kind: "account_banned" }}
      replyTo={replyTo()}
    />
  );
}

type Collection = { id: string; name: string; slug: string; suspendedAt: Date | null };

export function CollectionActions({ c }: { c: Collection }) {
  const notice = { collectionName: c.name, url: appUrl() + collectionPath(c.slug) };
  return c.suspendedAt ? (
    <ModerateDialog
      op="unsuspend"
      targetId={c.id}
      targetType="collection"
      subject={c.name}
      description="The collection and its pages become visible again."
      notice={{ kind: "collection_restored", ...notice }}
      replyTo={replyTo()}
    />
  ) : (
    <ModerateDialog
      op="suspend"
      targetId={c.id}
      targetType="collection"
      subject={c.name}
      description="Hides the collection and its pages there (they stay in their graphs) and takes it off Discover. Open reports on it are marked actioned."
      notice={{ kind: "collection_suspended", ...notice }}
      replyTo={replyTo()}
    />
  );
}
