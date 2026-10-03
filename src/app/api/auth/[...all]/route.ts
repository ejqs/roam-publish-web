import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { withRoute } from "@/lib/telemetry";

const handlers = toNextJsHandler(auth);

export const GET = withRoute("GET /api/auth/[...all]", handlers.GET);
export const POST = withRoute("POST /api/auth/[...all]", handlers.POST);
