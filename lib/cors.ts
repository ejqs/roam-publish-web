import { NextResponse } from "next/server";

const ALLOW_HEADERS =
	"Authorization, Content-Type, x-api-key, Accept";

/** CORS for Roam extension (browser) → our API. */
export function corsHeaders(request?: Request): HeadersInit {
	const origin = request?.headers.get("origin") || "*";
	return {
		"Access-Control-Allow-Origin": origin === "null" ? "*" : origin,
		"Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": ALLOW_HEADERS,
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
}

export function jsonWithCors(
	request: Request,
	data: unknown,
	init?: { status?: number },
) {
	return NextResponse.json(data, {
		status: init?.status ?? 200,
		headers: corsHeaders(request),
	});
}

export function optionsCors(request: Request) {
	return new NextResponse(null, {
		status: 204,
		headers: corsHeaders(request),
	});
}
