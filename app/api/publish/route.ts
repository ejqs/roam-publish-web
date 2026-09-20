import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { requireApiKey } from "@/lib/api-auth";
import { db } from "@/lib/database";
import { publication } from "@/db/schema/schema";
import { jsonWithCors, optionsCors } from "@/lib/cors";
import {
	isKind,
	isScope,
	isVisibility,
	normalizeContent,
	toPublicationResponse,
} from "@/lib/publish";
import { publicationUrl } from "@/lib/site";

export async function OPTIONS(request: Request) {
	return optionsCors(request);
}

export async function GET(request: Request) {
	const authResult = await requireApiKey(request);
	if (!authResult.ok) {
		return jsonWithCors(
			request,
			{ ok: false, error: authResult.error, message: authResult.message },
			{ status: authResult.status },
		);
	}

	const { ctx } = authResult;
	const rows = await db
		.select()
		.from(publication)
		.where(eq(publication.graphId, ctx.graphId))
		.orderBy(desc(publication.updatedAt));

	return jsonWithCors(request, {
		ok: true,
		graphName: ctx.graphName,
		items: rows.map((row) =>
			toPublicationResponse(
				row,
				ctx.graphName,
				publicationUrl(ctx.graphName, row.uid, request),
			),
		),
	});
}

export async function POST(request: Request) {
	const authResult = await requireApiKey(request);
	if (!authResult.ok) {
		return jsonWithCors(
			request,
			{ ok: false, error: authResult.error, message: authResult.message },
			{ status: authResult.status },
		);
	}

	const { ctx } = authResult;

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return jsonWithCors(
			request,
			{ ok: false, error: "invalid_request", message: "Expected JSON body" },
			{ status: 400 },
		);
	}

	const uid = typeof body.uid === "string" ? body.uid.trim() : "";
	const title = typeof body.title === "string" ? body.title.trim() : "";
	const kind = body.kind;
	const content = normalizeContent(body.content);
	const visibility = isVisibility(body.visibility)
		? body.visibility
		: "unlisted";
	const scope =
		kind === "block" && isScope(body.scope) ? body.scope : null;
	const contentFingerprint =
		typeof body.contentFingerprint === "string"
			? body.contentFingerprint
			: null;

	if (!uid || !title || !isKind(kind) || !content) {
		return jsonWithCors(
			request,
			{
				ok: false,
				error: "invalid_request",
				message:
					"uid, title, kind (page|block), and content are required",
			},
			{ status: 400 },
		);
	}

	const now = new Date();
	const existingRows = await db
		.select()
		.from(publication)
		.where(
			and(eq(publication.graphId, ctx.graphId), eq(publication.uid, uid)),
		)
		.limit(1);
	const existing = existingRows[0];

	let row;
	if (existing) {
		const updated = await db
			.update(publication)
			.set({
				kind,
				title,
				content,
				visibility,
				scope,
				status: "published",
				contentFingerprint,
				publishedAt: now,
				updatedAt: now,
			})
			.where(eq(publication.id, existing.id))
			.returning();
		row = updated[0];
	} else {
		const inserted = await db
			.insert(publication)
			.values({
				id: randomUUID(),
				graphId: ctx.graphId,
				uid,
				kind,
				title,
				content,
				visibility,
				scope,
				status: "published",
				contentFingerprint,
				publishedAt: now,
				updatedAt: now,
			})
			.returning();
		row = inserted[0];
	}

	if (!row) {
		return jsonWithCors(
			request,
			{
				ok: false,
				error: "write_failed",
				message: "Could not save publication",
			},
			{ status: 500 },
		);
	}

	return jsonWithCors(request, {
		ok: true,
		...toPublicationResponse(
			row,
			ctx.graphName,
			publicationUrl(ctx.graphName, row.uid, request),
		),
	});
}
