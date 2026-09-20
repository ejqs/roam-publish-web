/** App public base URL (no trailing slash). */
export function getBaseUrl(request?: Request): string {
	const fromEnv =
		process.env.NEXT_PUBLIC_APP_URL ||
		process.env.BETTER_AUTH_URL ||
		process.env.RAILWAY_PUBLIC_DOMAIN;

	if (fromEnv) {
		const raw = fromEnv.startsWith("http")
			? fromEnv
			: `https://${fromEnv}`;
		return raw.replace(/\/+$/, "");
	}

	if (request) {
		const url = new URL(request.url);
		return url.origin;
	}

	return "http://localhost:3000";
}

export function publicationUrl(
	graphName: string,
	uid: string,
	request?: Request,
): string {
	return `${getBaseUrl(request)}/${encodeURIComponent(graphName)}/${encodeURIComponent(uid)}`;
}

/** Roam graph names used as URL slugs. */
export function isValidGraphName(name: string): boolean {
	return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name);
}
