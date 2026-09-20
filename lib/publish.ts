export type Visibility = "public" | "unlisted" | "private";
export type Kind = "page" | "block";
export type Scope = "self" | "tree";

export type RoamJsonNode = {
	string?: string;
	uid?: string;
	children?: RoamJsonNode[];
};

export type StoredContent =
	| {
			format: "roam-json-v1";
			string?: string;
			children?: RoamJsonNode[];
	  }
	| {
			format: "markdown";
			body: string;
	  };

export function normalizeContent(raw: unknown): StoredContent | null {
	if (typeof raw === "string") {
		return { format: "markdown", body: raw };
	}
	if (!raw || typeof raw !== "object") return null;

	const obj = raw as Record<string, unknown>;
	if (obj.format === "markdown" && typeof obj.body === "string") {
		return { format: "markdown", body: obj.body };
	}
	if (obj.format === "roam-json-v1" || obj.children || obj.string) {
		return {
			format: "roam-json-v1",
			string: typeof obj.string === "string" ? obj.string : undefined,
			children: Array.isArray(obj.children)
				? (obj.children as RoamJsonNode[])
				: undefined,
		};
	}
	return null;
}

export function isVisibility(v: unknown): v is Visibility {
	return v === "public" || v === "unlisted" || v === "private";
}

export function isKind(v: unknown): v is Kind {
	return v === "page" || v === "block";
}

export function isScope(v: unknown): v is Scope {
	return v === "self" || v === "tree";
}

export type PublicationRow = {
	uid: string;
	kind: string;
	title: string;
	visibility: string;
	scope: string | null;
	status: string;
	contentFingerprint: string | null;
	publishedAt: Date;
	updatedAt: Date;
	content?: unknown;
};

export function toPublicationResponse(
	row: PublicationRow,
	graphName: string,
	url: string,
	includeContent = false,
) {
	return {
		uid: row.uid,
		kind: row.kind,
		status: row.status,
		title: row.title,
		visibility: row.visibility,
		scope: row.scope,
		url,
		publishedAt: row.publishedAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		contentFingerprint: row.contentFingerprint ?? undefined,
		...(includeContent ? { content: row.content } : {}),
	};
}
