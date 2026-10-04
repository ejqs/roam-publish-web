import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { reportReasons } from "../lib/report-reasons";
import { user } from "./auth-schema";

/** Who can read a page or open a front page: anyone, anyone with the password, or members only. */
export const ACCESS = ["open", "password", "members"] as const;
export type Access = (typeof ACCESS)[number];
/** A page's own access; "inherit" uses its graph's or collection's default. */
export const PLACE_ACCESS = ["inherit", ...ACCESS] as const;
export type PlaceAccess = (typeof PLACE_ACCESS)[number];
export const SHOW_AUTHOR = ["inherit", "show", "hide"] as const;
export type ShowAuthor = (typeof SHOW_AUTHOR)[number];
/**
 * View counts for a graph or collection: shown to everyone, shown only to the people who manage the
 * page ("hide"), or not tracked or shown at all ("off").
 */
export const VIEWS_MODE = ["show", "hide", "off"] as const;
export type ViewsMode = (typeof VIEWS_MODE)[number];
/** A page's own view count setting; "inherit" uses its graph's or collection's. */
export const PLACE_VIEWS = ["inherit", ...VIEWS_MODE] as const;
export type PlaceViews = (typeof PLACE_VIEWS)[number];

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const graph = pgTable("graph", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull().unique(),
  /** Public index of the graph's public publications at /{graph}. */
  frontPage: boolean("front_page").notNull().default(true),
  /** Lets search engines index the front page and public publications. */
  indexable: boolean("indexable").notNull().default(true),
  /**
   * Starting value of publication.discoverable for newly published pages. Changing it never
   * touches pages that already exist.
   */
  featured: boolean("featured").notNull().default(false),
  /** Short plain-text description shown on the front page. */
  description: text("description").notNull().default(""),
  /** Breadcrumbs on the front page and publications link back to the owner's public profile. */
  showOwner: boolean("show_owner").notNull().default(true),
  /** Unlisted publications show no breadcrumbs, so a shared link doesn't lead back to the graph. */
  hideUnlistedBreadcrumbs: boolean("hide_unlisted_breadcrumbs").notNull().default(true),
  /** Set by a moderator: the whole graph is hidden and its API key stops working. */
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  /** Who can open the front page at /{graph}. */
  indexAccess: text("index_access", { enum: ACCESS }).notNull().default("open"),
  /** What a page in this graph uses unless it sets its own access. */
  defaultAccess: text("default_access", { enum: ACCESS }).notNull().default("open"),
  /** Shared password for the front page and pages that use password access without their own. */
  passwordHash: text("password_hash"),
  /** Bumped on every password change, which signs out everyone who unlocked with the old one. */
  passwordVersion: integer("password_version").notNull().default(0),
  /** Bylines on this graph's pages, unless a page overrides it. */
  showAuthors: boolean("show_authors").notNull().default(false),
  /** View counts on this graph's listed pages, unless a page overrides it (lib/gates.ts viewsMode). */
  views: text("views", { enum: VIEWS_MODE }).notNull().default("show"),
  /** Flags of the countries readers come from, next to a shown view count. */
  showViewCountries: boolean("show_view_countries").notNull().default(true),
  /** New pages from the extension are shown in the graph; off means they only join default collections. */
  newPagesInGraph: boolean("new_pages_in_graph").notNull().default(true),
  /** RSS feed of the front page's open pages at /{graph}/feed.xml. Needs an open front page. */
  rss: boolean("rss").notNull().default(false),
  /**
   * The owner's Roam append-only token, AES-256-GCM encrypted (lib/append-token.ts). Used only to
   * append the roam.pub change log under each page's shortlink block. Null when none is stored.
   */
  appendTokenEnc: text("append_token_enc"),
  /** "invalid" once Roam rejects the stored token; the change log stops until it's replaced. */
  appendTokenStatus: text("append_token_status", { enum: ["ok", "invalid"] }),
  appendTokenAddedAt: timestamp("append_token_added_at", { withTimezone: true }),
  /** Last time Roam accepted the token (verification, settings, or a change log entry). */
  appendTokenOkAt: timestamp("append_token_ok_at", { withTimezone: true }),
  /** No change log call to Roam before this: paces calls per graph and backs off after a 429. */
  appendNextAt: timestamp("append_next_at", { withTimezone: true }),
  /** Consecutive 429s from Roam, for exponential backoff. */
  appendBackoff: integer("append_backoff").notNull().default(0),
  /** The owner paused the change log: the token is kept, but nothing is queued or sent. */
  changeLogPaused: boolean("change_log_paused").notNull().default(false),
  /** Kinds of change (`ChangeCategory`) the owner left out of the Roam change log; new kinds start on. */
  changeLogOff: text("change_log_off").array().notNull().default(sql`'{}'::text[]`),
  /** Changes to one setting in one send become a single line with the final value. */
  changeLogMerge: boolean("change_log_merge").notNull().default(true),
  /** Entries go under one [[date]] block per day instead of each carrying the date. */
  changeLogByDay: boolean("change_log_by_day").notNull().default(true),
  /** IANA time zone from the owner's browser; dates change log entries. */
  timeZone: text("time_zone"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** People the owner invited to publish from a shared graph. The owner is graph.userId, never a row here. */
export const graphMember = pgTable(
  "graph_member",
  {
    graphId: text("graph_id")
      .notNull()
      .references(() => graph.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.graphId, t.userId] }), index("graph_member_user_idx").on(t.userId)],
);

export const graphVerification = pgTable(
  "graph_verification",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    graphName: text("graph_name").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("graph_verification_graph_name_idx").on(t.graphName)],
);

export type Node = {
  uid: string;
  string: string;
  heading?: 1 | 2 | 3;
  /** How this block's children are shown; omitted for bullets. */
  viewType?: "bullet" | "numbered" | "document";
  /** Omitted for left. */
  align?: "left" | "center" | "right" | "justify";
  /** The block or page this block embeds with `{{embed: …}}`. */
  embed?: Node;
  /** Further embeds in the same block, in order; omitted when it has at most one. */
  moreEmbeds?: Node[];
  /** Set on an embedded page's root, whose string is "". */
  title?: string;
  children: Node[];
};

export const publication = pgTable(
  "publication",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    graphId: text("graph_id")
      .notNull()
      .references(() => graph.id, { onDelete: "cascade" }),
    rootUid: text("root_uid").notNull(),
    kind: text("kind", { enum: ["page", "block"] }).notNull(),
    /** Unlisted items are reachable by link only; public ones also appear on the front page. */
    visibility: text("visibility", { enum: ["public", "unlisted"] }).notNull().default("unlisted"),
    /**
     * Listed on /discover and the home page's trending list (when also public). Set from the
     * graph's default (graph.featured) when first published, then only changed per page.
     */
    discoverable: boolean("discoverable").notNull().default(false),
    title: text("title").notNull(),
    tree: jsonb("tree").$type<Node>().notNull(),
    contentHash: text("content_hash").notNull(),
    /** Set by a moderator: hidden from the public and locked against republishing. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedReason: text("removed_reason"),
    /** Who published it: the graph owner or a member. Members can only manage their own pages. */
    publishedBy: text("published_by").references(() => user.id, { onDelete: "set null" }),
    /** Author name from the extension, shown as a byline where bylines are on. */
    authorName: text("author_name"),
    /** Shown at /{graph}/{uid}. Off when the page should only appear in collections. */
    inGraph: boolean("in_graph").notNull().default(true),
    /** Access at /{graph}/{uid}; "inherit" uses graph.defaultAccess. */
    access: text("access", { enum: PLACE_ACCESS }).notNull().default("inherit"),
    /** The page's own password; when null, password access uses the graph's. */
    passwordHash: text("password_hash"),
    passwordVersion: integer("password_version").notNull().default(0),
    showAuthor: text("show_author", { enum: SHOW_AUTHOR }).notNull().default("inherit"),
    views: text("views", { enum: PLACE_VIEWS }).notNull().default("inherit"),
    showViewCountries: text("show_view_countries", { enum: SHOW_AUTHOR }).notNull().default("inherit"),
    /**
     * The page's tags: `#tags` and `Tags::` values from the tree, plus `tagsAdded`, minus `tagsHidden`
     * (lib/tags.ts). Recomputed on every write of `tree` or of those two.
     */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Tags added on the website. Kept across republishes. */
    tagsAdded: text("tags_added").array().notNull().default(sql`'{}'::text[]`),
    /** Tags from the Roam text removed on the website. Kept across republishes. */
    tagsHidden: text("tags_hidden").array().notNull().default(sql`'{}'::text[]`),
    /**
     * Encrypted with the passwords of every place it's shown (lib/encryption.ts). While set, `tree`
     * is an empty root, `searchText` and `tags` are empty, `cipher` holds the content and
     * `contentHash` is stored encrypted under the server secret.
     */
    encrypted: boolean("encrypted").notNull().default(false),
    cipher: text("cipher"),
    /** A password it was encrypted with was reset, so some place can't open it until it's republished. */
    needsRepublish: boolean("needs_republish").notNull().default(false),
    /** Plain text of the tree for full-text search (lib/tags.ts). Set on every write of `tree`. */
    searchText: text("search_text").notNull().default(""),
    /** Title weighted above body. 'simple' so any language matches word for word. */
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(search_text, '')), 'B')`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("publication_graph_root_idx").on(t.graphId, t.rootUid),
    index("publication_graph_visibility_idx").on(t.graphId, t.visibility),
    index("publication_tags_idx").using("gin", t.tags),
    index("publication_search_idx").using("gin", t.search),
  ],
);

/**
 * One row per reader per publication, ever. Only signed-in users with a graph count, and never the
 * publication's own owner; see /api/views.
 */
export const publicationView = pgTable(
  "publication_view",
  {
    publicationId: text("publication_id")
      .notNull()
      .references(() => publication.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.userId] }),
    // Covers the trending window: range on created_at, grouped by publication.
    index("publication_view_created_idx").on(t.createdAt, t.publicationId),
  ],
);

/**
 * One upvote per reader per publication. Same voters as views: signed-in users with a graph, never
 * the owner, and only on pages listed on /discover; see /api/votes.
 */
export const publicationVote = pgTable(
  "publication_vote",
  {
    publicationId: text("publication_id")
      .notNull()
      .references(() => publication.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.userId] })],
);

export type Visibility =(typeof publication.$inferSelect)["visibility"];

export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  isPublic: boolean("is_public").notNull().default(false),
  /** Short plain-text description shown on /u/{username}. */
  bio: text("bio").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Former usernames; /u/{old} redirects to the owner's current username. */
export const usernameAlias = pgTable("username_alias", {
  username: text("username").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


/**
 * Abuse reports from visitors. A report targets a graph or a collection (publicationId null: the
 * whole thing, otherwise one page in it) or a user's public profile. Exactly one of graphId,
 * collectionId and profileUserId is set.
 */
export const report = pgTable(
  "report",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    graphId: text("graph_id").references(() => graph.id, { onDelete: "cascade" }),
    collectionId: text("collection_id").references(() => collection.id, { onDelete: "cascade" }),
    profileUserId: text("profile_user_id").references(() => user.id, { onDelete: "cascade" }),
    publicationId: text("publication_id").references(() => publication.id, { onDelete: "cascade" }),
    reason: text("reason", { enum: reportReasons }).notNull(),
    details: text("details").notNull().default(""),
    reporterEmail: text("reporter_email"),
    reporterUserId: text("reporter_user_id").references(() => user.id, { onDelete: "set null" }),
    ipHash: text("ip_hash").notNull(),
    status: text("status", { enum: ["open", "dismissed", "actioned"] }).notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("report_status_created_idx").on(t.status, t.createdAt),
    index("report_graph_idx").on(t.graphId),
    index("report_publication_idx").on(t.publicationId),
    index("report_profile_user_idx").on(t.profileUserId),
    index("report_collection_idx").on(t.collectionId),
    check("report_target_check", sql`num_nonnulls(${t.graphId}, ${t.collectionId}, ${t.profileUserId}) = 1`),
  ],
);

/** Audit log of every moderator action. Target ids are kept as text so the log outlives the target. */
export const moderationAction = pgTable(
  "moderation_action",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    adminId: text("admin_id").references(() => user.id, { onDelete: "set null" }),
    targetType: text("target_type", {
      enum: ["publication", "graph", "user", "report", "collection", "announcement"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    action: text("action", {
      enum: [
        "remove", "restore", "suspend", "unsuspend", "ban", "unban", "dismiss",
        "rename_username", "clear_username", "release_username", "clear_bio", "clear_description",
        "delete_account", "delete_graph", "lift_block",
        "announce", "end_announcement", "mute", "unmute",
      ],
    }).notNull(),
    reason: text("reason").notNull().default(""),
    emailed: boolean("emailed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("moderation_action_created_idx").on(t.createdAt)],
);

export const BLOCKED_KINDS = ["email", "graph", "username"] as const;
export type BlockedKind = (typeof BLOCKED_KINDS)[number];

/**
 * What a deleted account leaves behind when a moderator had acted on it, so deleting the account
 * doesn't lift the ban: its email can't sign up, its Roam graphs can't be connected again, and its
 * usernames can't be claimed. Emails are kept only as a hash (see src/lib/deletion.ts); graph names
 * and usernames are lowercase. Admins lift entries at /admin/blocked.
 */
export const blockedIdentity = pgTable(
  "blocked_identity",
  {
    kind: text("kind", { enum: BLOCKED_KINDS }).notNull(),
    value: text("value").notNull(),
    reason: text("reason").notNull().default(""),
    /** The moderation_action row (delete_account) that created it. */
    moderationActionId: text("moderation_action_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.value] })],
);

/**
 * A place many people publish into from any of their graphs, at /c/{slug}. Pages in it get their
 * own URL, /c/{entryUid}, and their own access settings.
 */
export const collection = pgTable("collection", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Lowercase; also reserved in c_path. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  indexAccess: text("index_access", { enum: ACCESS }).notNull().default("open"),
  defaultAccess: text("default_access", { enum: ACCESS }).notNull().default("open"),
  passwordHash: text("password_hash"),
  passwordVersion: integer("password_version").notNull().default(0),
  showAuthors: boolean("show_authors").notNull().default(true),
  views: text("views", { enum: VIEWS_MODE }).notNull().default("show"),
  showViewCountries: boolean("show_view_countries").notNull().default(true),
  /** Lets search engines index the front page and its open, listed pages. */
  indexable: boolean("indexable").notNull().default(true),
  /** Starting listing of new pages: on Discover instead of only listed here. */
  featured: boolean("featured").notNull().default(false),
  /** The collection itself is listed on /discover. */
  discoverable: boolean("discoverable").notNull().default(false),
  /** RSS feed of the collection's open, listed pages at /c/{slug}/feed.xml. Needs an open collection page. */
  rss: boolean("rss").notNull().default(false),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const collectionMember = pgTable(
  "collection_member",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.userId] }),
    index("collection_member_user_idx").on(t.userId),
  ],
);

export const ENTRY_LISTING = ["unlisted", "listed", "discover"] as const;
export type EntryListing = (typeof ENTRY_LISTING)[number];

/** A publication shown in a collection, at /c/{entryUid}. */
export const collectionEntry = pgTable(
  "collection_entry",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "cascade" }),
    publicationId: text("publication_id")
      .notNull()
      .references(() => publication.id, { onDelete: "cascade" }),
    /** Random and lowercase, so pages from different graphs never clash; also reserved in c_path. */
    entryUid: text("entry_uid").notNull().unique(),
    listing: text("listing", { enum: ENTRY_LISTING }).notNull().default("listed"),
    access: text("access", { enum: PLACE_ACCESS }).notNull().default("inherit"),
    passwordHash: text("password_hash"),
    passwordVersion: integer("password_version").notNull().default(0),
    showAuthor: text("show_author", { enum: SHOW_AUTHOR }).notNull().default("inherit"),
    views: text("views", { enum: PLACE_VIEWS }).notNull().default("inherit"),
    showViewCountries: text("show_view_countries", { enum: SHOW_AUTHOR }).notNull().default("inherit"),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    /** Where the page came from when it was added. Shown on the dashboard only, never publicly. */
    originGraphName: text("origin_graph_name").notNull(),
    originRootUid: text("origin_root_uid").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("collection_entry_collection_publication_idx").on(t.collectionId, t.publicationId),
    index("collection_entry_publication_idx").on(t.publicationId),
  ],
);

/**
 * Everything under /c/{x}: collection slugs and entry uids share one namespace, so each is
 * reserved here and the two can never clash. Entry paths stay reserved after the entry is gone.
 */
export const cPath = pgTable("c_path", {
  path: text("path").primaryKey(),
  kind: text("kind", { enum: ["collection", "entry"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Collections that new pages published from a graph join automatically. */
export const graphDefaultCollection = pgTable(
  "graph_default_collection",
  {
    graphId: text("graph_id")
      .notNull()
      .references(() => graph.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.graphId, t.collectionId] })],
);

/**
 * Invitations to join a graph or collection, or to take it over. Nothing changes until the invitee
 * accepts, and only people with a verified email and their own verified graph can be invited.
 */
export const invite = pgTable(
  "invite",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    targetType: text("target_type", { enum: ["graph", "collection"] }).notNull(),
    targetId: text("target_id").notNull(),
    kind: text("kind", { enum: ["member", "transfer"] }).notNull(),
    inviteeUserId: text("invitee_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    status: text("status", { enum: ["pending", "accepted", "declined", "cancelled"] })
      .notNull()
      .default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invite_pending_idx")
      .on(t.targetType, t.targetId, t.inviteeUserId, t.kind)
      .where(sql`${t.status} = 'pending'`),
    // At most one transfer waits for an answer per graph or collection.
    uniqueIndex("invite_pending_transfer_idx")
      .on(t.targetType, t.targetId)
      .where(sql`${t.status} = 'pending' and ${t.kind} = 'transfer'`),
    index("invite_invitee_idx").on(t.inviteeUserId, t.status),
    index("invite_target_idx").on(t.targetType, t.targetId),
  ],
);

/**
 * Permanent /p/{id} link for a page or block. Keyed by graph + Roam uid, not by publication, so
 * unpublishing and publishing again keeps the same link and the same anchor block in Roam.
 */
export const shortlink = pgTable(
  "shortlink",
  {
    id: text("id").primaryKey(),
    graphId: text("graph_id")
      .notNull()
      .references(() => graph.id, { onDelete: "cascade" }),
    rootUid: text("root_uid").notNull(),
    /**
     * Uid of the block the change log nests under in Roam: the status link block the extension wrote
     * (a "Changelog" block from earlier builds).
     */
    anchorUid: text("anchor_uid"),
    /**
     * Last time the extension saw that block in the graph. Roam's Append API writes to the daily
     * note when the target block doesn't exist, so the change log only goes to recently confirmed blocks.
     */
    anchorConfirmedAt: timestamp("anchor_confirmed_at", { withTimezone: true }),
    /** The extension found the block gone: shown on the dashboard until republished or dismissed. */
    anchorMissingAt: timestamp("anchor_missing_at", { withTimezone: true }),
    anchorMissingDismissedAt: timestamp("anchor_missing_dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shortlink_graph_root_idx").on(t.graphId, t.rootUid)],
);

/**
 * Every change log entry roam.pub has queued for a shortlink, so the same entry is never appended to
 * Roam twice. `key` is unique per shortlink: content events use the content hash (a retried or
 * concurrent publish of the same content can't log twice), other events a fresh id.
 */
export const changelogEntry = pgTable(
  "changelog_entry",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    shortlinkId: text("shortlink_id")
      .notNull()
      .references(() => shortlink.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    text: text("text").notNull(),
    /**
     * Every entry is the page's history on its status page; status is only about Roam. Queued as
     * "pending", claimed as "sending" by the background sender, then "sent" or "failed". Only
     * entries Roam definitely didn't apply (429) go back to pending, so nothing is sent twice.
     * "dropped" entries were queued for a block that turned out to be gone, or waited too long.
     * "local" entries were never for Roam: no token, change log off (or this kind of change left
     * out), or no status link block. "merged" entries were folded into a later one in the same send.
     */
    status: text("status", { enum: ["pending", "sending", "sent", "failed", "dropped", "local", "merged"] })
      .notNull()
      .default("pending"),
    /** What kind of change it is (`ChangeCategory`); null on entries from before kinds existed. */
    category: text("category"),
    /** The line as written to Roam, after merging and without its time stamp. */
    roamText: text("roam_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("changelog_entry_key_idx").on(t.shortlinkId, t.key),
    index("changelog_entry_recent_idx").on(t.shortlinkId, t.createdAt),
    index("changelog_entry_status_idx").on(t.status, t.createdAt),
  ],
);

/** Readers from one country, by ISO 3166-1 alpha-2 code; "other" folds in countries too small to show. */
export type ViewCountry = { code: string; views: number };

/**
 * Views of a listed page from Umami, synced in the background (lib/view-sync.ts). One row per place:
 * a publication in its graph, or a collection entry. `views` is what the page shows: the all-time
 * `baseline` from the daily full sweep plus visits since, added by the hourly hot sweep.
 */
export const pageViews = pgTable(
  "page_views",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    publicationId: text("publication_id").references(() => publication.id, { onDelete: "cascade" }),
    entryId: text("entry_id").references(() => collectionEntry.id, { onDelete: "cascade" }),
    /** The page's most-visited path in Umami; country lookups filter on it. */
    path: text("path").notNull(),
    baseline: integer("baseline").notNull().default(0),
    views: integer("views").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    /** The hot sweep leaves the count alone until then; bigger counts wait longer. */
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }).notNull().defaultNow(),
    /** Top countries, most views first. Null until first looked up. */
    countries: jsonb("countries").$type<ViewCountry[]>(),
    countriesSyncedAt: timestamp("countries_synced_at", { withTimezone: true }),
    countriesNextSyncAt: timestamp("countries_next_sync_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("page_views_publication_idx").on(t.publicationId),
    uniqueIndex("page_views_entry_idx").on(t.entryId),
    index("page_views_countries_due_idx").on(t.countriesNextSyncAt),
    check("page_views_one_place", sql`(${t.publicationId} is null) <> (${t.entryId} is null)`),
  ],
);

/**
 * One row per background job (lib/jobs.ts): the claim that keeps two server processes from running
 * the same job at once, and the status shown at /admin/jobs.
 */
export const backgroundJob = pgTable("background_job", {
  name: text("name").primaryKey(),
  intervalMs: integer("interval_ms").notNull(),
  nextDueAt: timestamp("next_due_at", { withTimezone: true }).notNull().defaultNow(),
  /** Set while a process runs the job; a lease that ran out means that process died mid-run. */
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
  lastFinishedAt: timestamp("last_finished_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastDurationMs: integer("last_duration_ms"),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  runCount: integer("run_count").notNull().default(0),
  failCount: integer("fail_count").notNull().default(0),
  /** What the last run that did something did, e.g. `{ calls: 3, pages: 41 }`. */
  lastResult: jsonb("last_result").$type<JobResult>(),
  /** State the job keeps between runs. */
  cursor: jsonb("cursor").$type<Record<string, unknown>>().notNull().default({}),
});

export type JobResult = Record<string, string | number | boolean | null>;

/**
 * Successful password entries, per password: the scope and id of what the password belongs to (a
 * page's own, or its graph's or collection's) and its version, so changing it starts over. An unlock
 * lasts 30 days on a browser, so this is close to the number of people who got in.
 */
export const passwordUnlock = pgTable(
  "password_unlock",
  {
    scope: text("scope", { enum: ["graph", "collection", "publication", "entry"] }).notNull(),
    targetId: text("target_id").notNull(),
    passwordVersion: integer("password_version").notNull(),
    unlocks: integer("unlocks").notNull().default(0),
    lastUnlockAt: timestamp("last_unlock_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.targetId, t.passwordVersion] })],
);

export const LOCK_SCOPES = ["graph", "collection", "publication", "entry"] as const;
export type LockScope = (typeof LOCK_SCOPES)[number];

/**
 * A password's key pair, for encrypted pages (lib/encryption.ts). The private key is stored
 * encrypted with a key made from the password, so only someone who knows it can open a page. Kept
 * only for passwords of at least 10 characters.
 */
export const lockKey = pgTable(
  "lock_key",
  {
    scope: text("scope", { enum: LOCK_SCOPES }).notNull(),
    targetId: text("target_id").notNull(),
    publicKey: text("public_key").notNull(),
    /** "v1.{salt}.{iv}.{tag}.{ciphertext}", base64url: the private key under scrypt(password, salt). */
    wrappedPrivateKey: text("wrapped_private_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.targetId] })],
);

/** An encrypted page's content key, sealed to the key pair of one password that opens it. */
export const publicationKey = pgTable(
  "publication_key",
  {
    publicationId: text("publication_id")
      .notNull()
      .references(() => publication.id, { onDelete: "cascade" }),
    scope: text("scope", { enum: LOCK_SCOPES }).notNull(),
    targetId: text("target_id").notNull(),
    sealedKey: text("sealed_key").notNull(),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.scope, t.targetId] }), index("publication_key_lock_idx").on(t.scope, t.targetId)],
);

/**
 * Calls to each entry point (route handler, server action), outside service and page error, per
 * minute: written by the metrics-flush job from lib/telemetry.ts, shown on /admin/status, kept two
 * weeks. `hist` counts calls per latency bin (LATENCY_BINS), for percentiles; `rejected` counts 4xx
 * answers, which aren't errors.
 */
export const endpointMetric = pgTable(
  "endpoint_metric",
  {
    name: text("name").notNull(),
    minute: timestamp("minute", { withTimezone: true }).notNull(),
    kind: text("kind", { enum: ["route", "action", "dep", "page"] }).notNull(),
    count: integer("count").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    sumMs: integer("sum_ms").notNull().default(0),
    maxMs: integer("max_ms").notNull().default(0),
    hist: integer("hist").array().notNull(),
    /** 4xx answers by status, e.g. `{ "409": 3 }`. */
    rejected: jsonb("rejected").$type<Record<string, number>>().notNull().default({}),
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.name, t.minute] }), index("endpoint_metric_minute_idx").on(t.minute)],
);

export const ANNOUNCEMENT_TONES = ["warning", "critical"] as const;
export type AnnouncementTone = (typeof ANNOUNCEMENT_TONES)[number];
export const ANNOUNCEMENT_AUDIENCES = ["everyone", "signed-in"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

/**
 * The site-wide banner, for urgent things only. Admins post `manual` ones; the status-banner job keeps
 * one `auto` row per kind of problem (`key`), pushing `endsAt` forward while the problem lasts, so it
 * goes away on its own when the problem does, or when the job stops running.
 */
export const announcement = pgTable(
  "announcement",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    source: text("source", { enum: ["manual", "auto"] }).notNull(),
    /** Auto rows only: which problem this is, e.g. `publishing`. */
    key: text("key"),
    tone: text("tone", { enum: ANNOUNCEMENT_TONES }).notNull(),
    message: text("message").notNull(),
    linkUrl: text("link_url"),
    linkText: text("link_text"),
    audience: text("audience", { enum: ANNOUNCEMENT_AUDIENCES }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Hidden until then; an admin's call that an auto banner isn't helping. */
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("announcement_key_idx").on(t.key), index("announcement_ends_idx").on(t.endsAt)],
);
