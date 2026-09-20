import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/database";
import { graph } from "@/db/schema/schema";

export type ApiAuthContext = {
	userId: string;
	apiKeyId: string;
	graphName: string;
	graphId: string;
};

function extractApiKey(request: Request): string | null {
	const xKey = request.headers.get("x-api-key");
	if (xKey?.trim()) return xKey.trim();

	const authHeader = request.headers.get("authorization");
	if (!authHeader) return null;
	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() || null;
}

function metadataGraphName(metadata: unknown): string | null {
	let value: unknown = metadata;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			return null;
		}
	}
	if (!value || typeof value !== "object") return null;
	const g = (value as { graphName?: unknown }).graphName;
	return typeof g === "string" && g.trim() ? g.trim() : null;
}

/**
 * Verify Bearer / x-api-key and resolve the bound graph.
 */
export async function requireApiKey(
	request: Request,
): Promise<
	| { ok: true; ctx: ApiAuthContext }
	| { ok: false; status: number; error: string; message: string }
> {
	const key = extractApiKey(request);
	if (!key) {
		return {
			ok: false,
			status: 401,
			error: "unauthorized",
			message: "Missing API key (Authorization: Bearer or x-api-key)",
		};
	}

	const result = await auth.api.verifyApiKey({
		body: { key },
	});

	if (!result.valid || !result.key) {
		return {
			ok: false,
			status: 401,
			error: "unauthorized",
			message: "Invalid API key",
		};
	}

	const userId = result.key.referenceId;
	const graphName = metadataGraphName(result.key.metadata);

	if (!graphName) {
		return {
			ok: false,
			status: 401,
			error: "unauthorized",
			message: "API key is not bound to a graph",
		};
	}

	const rows = await db
		.select()
		.from(graph)
		.where(eq(graph.name, graphName))
		.limit(1);

	const g = rows[0];
	if (!g || g.userId !== userId) {
		return {
			ok: false,
			status: 401,
			error: "unauthorized",
			message: "API key graph binding mismatch",
		};
	}

	return {
		ok: true,
		ctx: {
			userId,
			apiKeyId: result.key.id,
			graphName: g.name,
			graphId: g.id,
		},
	};
}
