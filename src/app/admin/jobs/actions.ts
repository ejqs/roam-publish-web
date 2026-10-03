"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { requestRun } from "@/lib/jobs";
import { jobByName } from "@/lib/jobs-registry";

/** Makes a job due now. The background worker runs it within a few seconds, not this request. */
export async function runJobNow(name: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const job = jobByName(name);
  if (!job?.exclusive) return { ok: false, message: "That job can't be run on demand." };
  const reason = job.disabledReason();
  if (reason) return { ok: false, message: `Turned off: ${reason}.` };
  await requestRun(name);
  revalidatePath("/admin/jobs");
  return { ok: true, message: `${job.label} will run within a few seconds.` };
}
