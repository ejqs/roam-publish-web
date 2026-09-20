import { and, eq } from "drizzle-orm";
import { requireApiKey } from "@/lib/api-auth";
import { db } from "@/lib/database";
import { publication } from "@/db/schema/schema";
import { jsonWithCors, optionsCors } from "@/lib/cors";
import {
	isScope,
	isVisibility,
	toPublicationResponse,
} from "@/lib/publish";
import { publicationUrl } from "@/lib/site";

type RouteContext = { params: Promise<{ uid: string }> };

export async function OPTIONS(request: Request) {
	return optionsCors(request);
}

export async function GET(request: Request, context: RouteContext) {
	const authResult = await requireApiKey(request);
	if (!authResult.ok) {
		return jsonWithCors(
			request,
			{ ok: false, error: authResult.error, message: authResult.message },
			{ status: authResult.status },
		);
	}

	const { uid } = await context.params;
	const { ctx } = authResult;

	const rows = await db
		.select()
		.from(publication)
		.where(
			and(eq(publication.graphId, ctx.graphId), eq(publication.uid, uid)),
		)
		.limit(1);

	const row = rows[0];
	if (!row) {
		return jsonWithCors(
			request,
			{ ok: false, error: "not_found", message: "Publication not found" },
			{ status: 404 },
		);
	}

	return jsonWithCors(request, {
		ok: true,
		...toPublicationResponse(
			row,
			ctx.graphName,
			publicationUrl(ctx.graphName, row.uid, request),
			true,
		),
	});
}

export async function PATCH(request: Request, context: RouteContext) {
	const authResult = await requireApiKey(request);
	if (!authResult.ok) {
		return jsonWithCors(
			request,
			{ ok: false, error: authResult.error, message: authResult.message },
			{ status: authResult.status },
		);
	}

	const { uid } = await context.params;
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

	const rows = await db
		.select()
		.from(publication)
		.where(
			and(eq(publication.graphId, ctx.graphId), eq(publication.uid, uid)),
		)
		.limit(1);

	const existing = rows[0];
	if (!existing) {
		return jsonWithCors(
			request,
			{ ok: false, error: "not_found", message: "Publication not found" },
			{ status: 404 },
		);
	}

	const patch: {
		visibility?: string;
		scope?: string | null;
		title?: string;
		updatedAt: Date;
	} = { updatedAt: new Date() };

	if (isVisibility(body.visibility)) {
		patch.visibility = body.visibility;
	}
	if (body.scope !== undefined) {
		if (existing.kind === "block" && isScope(body.scope)) {
			patch.scope = body.scope;
		} else if (body.scope === null) {
			patch.scope = null;
		}
	}
	if (typeof body.title === "string" && body.title.trim()) {
		patch.title = body.title.trim();
	}

	const updated = await db
		.update(publication)
		.set(patch)
		.where(eq(publication.id, existing.id))
		.returning();

	const row = updated[0];
	if (!row) {
		return jsonWithCors(
			request,
			{ ok: false, error: "write_failed", message: "Could not update" },
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

export async function DELETE(request: Request, context: RouteContext) {
	const authResult = await requireApiKey(request);
	if (!authResult.ok) {
		return jsonWithCors(
			request,
			{ ok: false, error: authResult.error, message: authResult.message },
			{ status: authResult.status },
		);
	}

	const { uid } = await context.params;
	const { ctx } = authResult;

	const deleted = await db
		.delete(publication)
		.where(
			and(eq(publication.graphId, ctx.graphId), eq(publication.uid, uid)),
		)
		.returning();

	if (!deleted[0]) {
		return jsonWithCors(
			request,
			{ ok: false, error: "not_found", message: "Publication not found" },
			{ status: 404 },
		);
	}

	return jsonWithCors(request, { ok: true, uid });
}
