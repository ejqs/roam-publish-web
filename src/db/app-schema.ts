import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const graph = pgTable("graph", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull().unique(),
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
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    tree: jsonb("tree").$type<Node>().notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("publication_graph_root_idx").on(t.graphId, t.rootUid),
    uniqueIndex("publication_graph_slug_idx").on(t.graphId, t.slug),
  ],
);
