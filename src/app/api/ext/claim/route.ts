import { json, preflight } from "@/lib/cors";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

/**
 * Retired. Verification now finishes on the website, and keys come from the dashboard, so no code
 * on a daily note can be claimed by whoever reads it first.
 */
export const POST = withRoute("POST /api/ext/claim", async (req: Request) => {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return json(
    req,
    { error: `Get your API key at ${base}/dashboard/keys and paste it in the extension settings.` },
    410,
  );
});
