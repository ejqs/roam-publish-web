import { checkHealth } from "@/lib/health";
import { withRoute } from "@/lib/telemetry";

/** For Railway's healthcheck and uptime monitors: 200 when the database and job worker are fine, else 503. */
export const GET = withRoute("GET /api/health", async () => {
  const { ok, checks } = await checkHealth();
  return Response.json(
    { status: ok ? "ok" : "degraded", checks },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
});
