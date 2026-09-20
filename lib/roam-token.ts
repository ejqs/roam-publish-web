/**
 * Validate a Roam graph API token against the Append API.
 * Append-only tokens work here; successful exchange appends a short marker block.
 */

const APPEND_API =
	process.env.ROAM_APPEND_API_BASE_URL ||
	"https://append-api.roamresearch.com";

export type RoamValidationResult =
	| { ok: true }
	| { ok: false; code: "invalid_roam_token" | "roam_unreachable"; detail?: string };

export async function validateRoamAppendToken(
	roamToken: string,
	graphName: string,
): Promise<RoamValidationResult> {
	if (process.env.ROAM_TOKEN_VALIDATION === "skip") {
		return { ok: true };
	}

	if (!roamToken.startsWith("roam-graph-token-")) {
		return { ok: false, code: "invalid_roam_token", detail: "Unexpected token prefix" };
	}

	const url = `${APPEND_API.replace(/\/+$/, "")}/api/graph/${encodeURIComponent(graphName)}/append-blocks`;

	const body = {
		location: {
			page: { title: "Roam Publish" },
			"nest-under": { string: "Auth checks" },
		},
		"append-data": [
			{
				string: `[roam-publish] auth exchange ${new Date().toISOString()}`,
			},
		],
	};

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				Authorization: `Bearer ${roamToken}`,
				"x-authorization": `Bearer ${roamToken}`,
			},
			body: JSON.stringify(body),
			redirect: "follow",
		});

		if (res.ok || res.status === 204) {
			return { ok: true };
		}

		if (res.status === 401 || res.status === 403) {
			const text = await res.text().catch(() => "");
			return {
				ok: false,
				code: "invalid_roam_token",
				detail: text.slice(0, 200) || `HTTP ${res.status}`,
			};
		}

		// 404 graph / other client errors → treat as bad token/graph pairing
		if (res.status >= 400 && res.status < 500) {
			const text = await res.text().catch(() => "");
			return {
				ok: false,
				code: "invalid_roam_token",
				detail: text.slice(0, 200) || `HTTP ${res.status}`,
			};
		}

		return {
			ok: false,
			code: "roam_unreachable",
			detail: `HTTP ${res.status}`,
		};
	} catch (err) {
		return {
			ok: false,
			code: "roam_unreachable",
			detail: err instanceof Error ? err.message : "fetch failed",
		};
	}
}
