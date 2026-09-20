import { defineRelationsPart } from "drizzle-orm";
import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

/**
 * One Roam graph ↔ one site slug.
 * Graph name is the public URL segment: /{name}/{uid}
 */
export const graph = pgTable(
	"graph",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("graph_name_uidx").on(table.name),
		index("graph_userId_idx").on(table.userId),
	],
);

/**
 * Published page/block snapshot. No teams/groups in this prototype.
 */
export const publication = pgTable(
	"publication",
	{
		id: text("id").primaryKey(),
		graphId: text("graph_id")
			.notNull()
			.references(() => graph.id, { onDelete: "cascade" }),
		uid: text("uid").notNull(),
		kind: text("kind").notNull(), // page | block
		title: text("title").notNull(),
		content: jsonb("content").notNull(),
		visibility: text("visibility").notNull().default("unlisted"), // public | unlisted | private
		scope: text("scope"), // self | tree | null
		status: text("status").notNull().default("published"),
		contentFingerprint: text("content_fingerprint"),
		publishedAt: timestamp("published_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("publication_graph_uid_uidx").on(table.graphId, table.uid),
		index("publication_graphId_idx").on(table.graphId),
	],
);

export const publishRelations = defineRelationsPart(
	{ graph, publication, user },
	(r) => ({
		graph: {
			user: r.one.user({
				from: r.graph.userId,
				to: r.user.id,
			}),
			publications: r.many.publication({
				from: r.graph.id,
				to: r.publication.graphId,
			}),
		},
		publication: {
			graph: r.one.graph({
				from: r.publication.graphId,
				to: r.graph.id,
			}),
		},
	}),
);
