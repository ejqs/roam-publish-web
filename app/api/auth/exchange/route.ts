import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/database";
import { apikey, user } from "@/db/schema/auth-schema";
import { graph } from "@/db/schema/schema";
import { jsonWithCors, optionsCors } from "@/lib/cors";
import { validateRoamAppendToken } from "@/lib/roam-token";
import { getBaseUrl, isValidGraphName } from "@/lib/site";

type ExchangeBody = {
	roamToken?: string;
	graphName?: string;
};

function syntheticEmail(graphName: string): string {
	const safe = graphName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
	return `${safe}@graphs.roam.pub`;
}

export async function OPTIONS(request: Request) {
	return optionsCors(request);
}

export async function POST(request: Request) {
	let body: ExchangeBody;
	try {
		body = (await request.json()) as ExchangeBody;
	} catch {
		return jsonWithCors(
			request,
			{ ok: false, error: "invalid_request", message: "Expected JSON body" },
			{ status: 400 },
		);
	}

	const roamToken =
		typeof body.roamToken === "string" ? body.roamToken.trim() : "";
	const graphName =
		typeof body.graphName === "string" ? body.graphName.trim() : "";

	if (!roamToken || !graphName) {
		return jsonWithCors(
			request,
			{
				ok: false,
				error: "invalid_request",
				message: "roamToken and graphName are required",
			},
			{ status: 400 },
		);
	}

	if (!isValidGraphName(graphName)) {
		return jsonWithCors(
			request,
			{
				ok: false,
				error: "invalid_request",
				message: "graphName must be alphanumeric (hyphens/underscores ok)",
			},
			{ status: 400 },
		);
	}

	const validation = await validateRoamAppendToken(roamToken, graphName);
	if (!validation.ok) {
		const status = validation.code === "roam_unreachable" ? 502 : 401;
		return jsonWithCors(
			request,
			{
				ok: false,
				error: validation.code,
				message:
					validation.code === "roam_unreachable"
						? "Could not reach Roam Append API"
						: "Roam rejected the token for this graph",
				detail: validation.detail,
			},
			{ status },
		);
	}

	const existingGraphs = await db
		.select()
		.from(graph)
		.where(eq(graph.name, graphName))
		.limit(1);

	let userId: string;
	let graphId: string;

	if (existingGraphs[0]) {
		userId = existingGraphs[0].userId;
		graphId = existingGraphs[0].id;
	} else {
		userId = randomUUID();
		graphId = randomUUID();
		const now = new Date();
		const email = syntheticEmail(graphName);

		await db.insert(user).values({
			id: userId,
			name: graphName,
			email,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
			role: "user",
			banned: false,
		});

		await db.insert(graph).values({
			id: graphId,
			name: graphName,
			userId,
			createdAt: now,
			updatedAt: now,
		});
	}

	await db
		.update(apikey)
		.set({ enabled: false, updatedAt: new Date() })
		.where(and(eq(apikey.referenceId, userId), eq(apikey.enabled, true)));

	const created = await auth.api.createApiKey({
		body: {
			userId,
			name: `graph:${graphName}`.slice(0, 32),
			metadata: { graphName, graphId },
			rateLimitEnabled: true,
			rateLimitTimeWindow: 1000 * 60 * 60,
			rateLimitMax: 1000,
		},
	});

	const apiKey =
		created && typeof created === "object" && "key" in created
			? (created as { key: string }).key
			: null;

	if (!apiKey) {
		return jsonWithCors(
			request,
			{
				ok: false,
				error: "key_creation_failed",
				message: "Failed to create API key",
			},
			{ status: 500 },
		);
	}

	return jsonWithCors(request, {
		ok: true,
		apiKey,
		graphName,
		baseUrl: getBaseUrl(request),
	});
}
