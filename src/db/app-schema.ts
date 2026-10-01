import {
  boolean,
  index,
  jsonb,
  pgTable,
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
  /** Opt-in listing on the roam.pub home page. */
  featured: boolean("featured").notNull().default(false),
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

export type Visibility = (typeof publication.$inferSelect)["visibility"];

export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  isPublic: boolean("is_public").notNull().default(false),
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


/** Abuse reports from visitors. A null publicationId means the graph as a whole was reported. */
export const report = pgTable(
  "report",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    graphId: text("graph_id")
      .notNull()
      .references(() => graph.id, { onDelete: "cascade" }),
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
        "rename_username", "clear_username", "release_username",
      ],
    }).notNull(),
    reason: text("reason").notNull().default(""),
    emailed: boolean("emailed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("moderation_action_created_idx").on(t.createdAt)],
);
