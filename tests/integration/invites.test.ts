import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invite } from "@/db/schema";
import { createInvite, pendingInvitesOn, respondToInvite } from "@/lib/invites";
import { resetDb } from "../helpers/db";
import { addGraphMember, makeGraph, makeUser, type TestUser } from "../helpers/factories";
import { resetRequest } from "../helpers/request";

let owner: TestUser, other: TestUser;
let graphId: string;

/** Moves an invite's expiry into the past, as if a week went by unanswered. */
const lapse = (id: string) => db.update(invite).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(invite.id, id));
const only = async () => (await db.select().from(invite).orderBy(invite.createdAt)).map((i) => i.status);

beforeEach(async () => {
  await resetDb();
  resetRequest();
  [owner, other] = [await makeUser(), await makeUser()];
  graphId = (await makeGraph(owner.id)).id;
  await makeGraph(other.id);
});

describe("expired invites", () => {
  test("an invite that ran out doesn't block inviting the same person again", async () => {
    const first = await createInvite({ type: "graph", targetId: graphId, kind: "member", inviterId: owner.id, email: other.email });
    expect(first.ok).toBe(true);
    const [i] = await db.select().from(invite);
    await lapse(i.id);
    expect(await pendingInvitesOn("graph", graphId)).toHaveLength(0);

    const again = await createInvite({ type: "graph", targetId: graphId, kind: "member", inviterId: owner.id, email: other.email });
    expect(again).toMatchObject({ ok: true });
    expect(await only()).toEqual(["expired", "pending"]);
    expect(await pendingInvitesOn("graph", graphId)).toHaveLength(1);
  });

  test("a transfer that ran out doesn't block a new transfer", async () => {
    await addGraphMember(graphId, other.id);
    expect((await createInvite({ type: "graph", targetId: graphId, kind: "transfer", inviterId: owner.id, email: other.email })).ok).toBe(true);
    const [i] = await db.select().from(invite);
    await lapse(i.id);
    expect((await createInvite({ type: "graph", targetId: graphId, kind: "transfer", inviterId: owner.id, email: other.email })).ok).toBe(true);
  });

  test("an invite still open keeps blocking a second one", async () => {
    await createInvite({ type: "graph", targetId: graphId, kind: "member", inviterId: owner.id, email: other.email });
    const again = await createInvite({ type: "graph", targetId: graphId, kind: "member", inviterId: owner.id, email: other.email });
    expect(again).toEqual({ ok: false, message: "They already have an invite." });
  });

  test("answering an invite that ran out marks it expired", async () => {
    await createInvite({ type: "graph", targetId: graphId, kind: "member", inviterId: owner.id, email: other.email });
    const [i] = await db.select().from(invite);
    await lapse(i.id);
    expect(await respondToInvite(i.id, other.id, true)).toEqual({ ok: false, message: "That invite expired. Ask for a new one." });
    expect(await only()).toEqual(["expired"]);
  });
});
