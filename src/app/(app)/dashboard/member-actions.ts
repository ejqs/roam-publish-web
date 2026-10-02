"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { cancelInvite, createInvite, removeMember, respondToInvite, type TargetType } from "@/lib/invites";
import { rateLimit } from "@/lib/rate-limit";

export type MemberResult = { ok: boolean; message: string };

async function userId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

const EXPIRED: MemberResult = { ok: false, message: "Your session expired. Please log in again." };
const Target = z.enum(["graph", "collection"]);

function revalidate() {
  revalidatePath("/dashboard", "layout");
}

export async function inviteByEmail(type: TargetType, targetId: string, email: string): Promise<MemberResult> {
  const uid = await userId();
  if (!uid) return EXPIRED;
  const parsed = z.email("Enter an email address.").safeParse(email.trim());
  if (!parsed.success || !Target.safeParse(type).success) return { ok: false, message: "Enter an email address." };
  // Each lookup answers whether an address is eligible, so keep the rate low.
  if (!rateLimit(`invite:user:${uid}`, 20, 60 * 60 * 1000))
    return { ok: false, message: "Too many invites. Try again later." };
  const res = await createInvite({ type, targetId, kind: "member", inviterId: uid, email: parsed.data });
  revalidate();
  return res;
}

export async function offerTransfer(type: TargetType, targetId: string, memberId: string): Promise<MemberResult> {
  const uid = await userId();
  if (!uid) return EXPIRED;
  if (!Target.safeParse(type).success) return { ok: false, message: "Invalid request." };
  const res = await createInvite({ type, targetId, kind: "transfer", inviterId: uid, inviteeUserId: memberId });
  revalidate();
  return res;
}

export async function withdrawInvite(inviteId: string): Promise<MemberResult> {
  const uid = await userId();
  if (!uid) return EXPIRED;
  const res = await cancelInvite(inviteId, uid);
  revalidate();
  return res;
}

export async function removeMemberAction(type: TargetType, targetId: string, memberId: string): Promise<MemberResult> {
  const uid = await userId();
  if (!uid) return EXPIRED;
  if (!Target.safeParse(type).success) return { ok: false, message: "Invalid request." };
  const res = await removeMember(type, targetId, memberId, uid);
  revalidate();
  revalidatePath("/dashboard/keys");
  return res;
}

export async function leave(type: TargetType, targetId: string): Promise<MemberResult> {
  const uid = await userId();
  if (!uid) return EXPIRED;
  if (!Target.safeParse(type).success) return { ok: false, message: "Invalid request." };
  const res = await removeMember(type, targetId, uid, uid);
  revalidate();
  return res;
}

export async function answerInvite(inviteId: string, accept: boolean): Promise<MemberResult> {
  const uid = await userId();
  if (!uid) return EXPIRED;
  const res = await respondToInvite(inviteId, uid, accept);
  revalidate();
  revalidatePath("/[graph]", "layout");
  revalidatePath("/c/[id]", "layout");
  return res;
}
