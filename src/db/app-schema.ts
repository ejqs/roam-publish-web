import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { reportReasons } from "../lib/report-reasons";
import { user } from "./auth-schema";

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
   * Default for listing public pages on /discover and the home page's trending list. Each
   * publication can override it (publication.discoverable).
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
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    /** Discover listing for this page: null follows the graph's default (graph.featured). */
    discoverable: boolean("discoverable"),
    title: text("title").notNull(),
    tree: jsonb("tree").$type<Node>().notNull(),
    contentHash: text("content_hash").notNull(),
    /** Set by a moderator: hidden from the public and locked against republishing. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedReason: text("removed_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("publication_graph_root_idx").on(t.graphId, t.rootUid),
    index("publication_graph_visibility_idx").on(t.graphId, t.visibility),
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

export type Visibility = (typeof publication.$inferSelect)["visibility"];

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
 * Abuse reports from visitors. A report targets a graph (publicationId null: the whole graph,
 * otherwise one page) or a user's public profile (profileUserId set, graphId null).
 */
export const report = pgTable(
  "report",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    graphId: text("graph_id").references(() => graph.id, { onDelete: "cascade" }),
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
    check("report_target_check", sql`(${t.graphId} is null) <> (${t.profileUserId} is null)`),
  ],
);

/** Audit log of every moderator action. Target ids are kept as text so the log outlives the target. */
export const moderationAction = pgTable(
  "moderation_action",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    adminId: text("admin_id").references(() => user.id, { onDelete: "set null" }),
    targetType: text("target_type", { enum: ["publication", "graph", "user", "report"] }).notNull(),
    targetId: text("target_id").notNull(),
    action: text("action", {
      enum: [
        "remove", "restore", "suspend", "unsuspend", "ban", "unban", "dismiss",
        "rename_username", "clear_username", "release_username", "clear_bio", "clear_description",
      ],
    }).notNull(),
    reason: text("reason").notNull().default(""),
    emailed: boolean("emailed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("moderation_action_created_idx").on(t.createdAt)],
);
