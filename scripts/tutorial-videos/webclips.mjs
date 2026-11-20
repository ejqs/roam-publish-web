import { record } from "./rec.mjs";
import fs from "node:fs";
const OUT = process.env.OUT || new URL("../../public/tutorials", import.meta.url).pathname;
const TMP = (await import("node:os")).tmpdir();
const raw = fs.readFileSync(`${TMP}/tutorial-seed-cookie.txt`, "utf8").trim();
const i = raw.indexOf("=");
const cookies = [{ name: raw.slice(0, i), value: raw.slice(i + 1), domain: "localhost", path: "/" }];
const css = "nextjs-portal{display:none!important}";
const base = { width: 960, height: 540, scale: 2, cookies, css, setup: async (p) => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(800); } };

const clips = {
  async password() {
    await record({ ...base, url: "http://localhost:3000/dashboard/ejqs", out: `${OUT}/password.mp4`, async script(h) {
      const p = h.p;
      await h.wait(700);
      const row = p.locator(':text("Reading notes") >> xpath=ancestor::*[.//button[contains(.,"Public")]][1]');
      await h.click(row.locator('button:has-text("Public")').first(), { after: 1100 });
      await h.click(p.locator('button[role=radio]:has-text("Password")').first(), { after: 700 });
      await h.click(p.locator('[role=dialog] input, input[type=password]').first(), { after: 200 });
      await h.type("book-club-2026");
      await h.wait(400);
      await h.click(p.getByRole("button", { name: "Set password" }), { after: 1600 });
      await p.keyboard.press("Escape"); await h.wait(1200);
      // A reader, signed out, opens the page.
      await h.ctx.clearCookies();
      await p.goto("http://localhost:3000/ejqs/tut1aaaaa", { waitUntil: "networkidle" });
      await h.wait(1300);
      await h.click(p.locator("input[type=password]").first(), { after: 200 });
      await h.type("book-club-2026");
      await h.wait(300);
      await h.click(p.getByRole("button", { name: /unlock|open/i }).first(), { after: 2600 });
    } });
  },
};

const rawNew = fs.readFileSync(`${TMP}/tutorial-seed-new-cookie.txt`, "utf8").trim();
const j = rawNew.indexOf("=");
clips.setup = async () => {
  await record({ ...base, cookies: [{ name: rawNew.slice(0, j), value: rawNew.slice(j + 1), domain: "localhost", path: "/" }],
    url: "http://localhost:3000/onboarding", out: `${OUT}/setup.mp4`, async script(h) {
    const p = h.p;
    await h.wait(900);
    await h.click(p.locator("label[for=ack-token-page]"), { after: 400 });
    await h.click(p.getByRole("button", { name: "I understand, continue" }), { after: 900 });
    await h.click(p.getByText("This is my own graph, or I manage this shared graph"), { after: 400 });
    await h.click(p.locator("#graphName"), { after: 150 });
    await h.type("my-notes");
    await h.click(p.locator("#token"), { after: 150 });
    await h.type("roam-graph-token-a1b2c3d4e5", 25);
    await h.wait(300);
    await h.click(p.getByRole("button", { name: "Verify graph" }), { after: 2500 });
    await h.click(p.getByRole("button", { name: "Get API key" }), { after: 1500 });
    await h.click(p.getByRole("button", { name: /copy/i }).first(), { after: 1200 });
    // In Roam: the first publish asks for the key.
    await p.goto("http://localhost:8766/index.html?scene=publish&nokey=1&graph=my-notes");
    await p.waitForFunction(() => window.__ready); await h.wait(1400);
    await h.to("h1.rm-title-display", { dx: 0.4 }); await h.wait(400);
    await h.click('.roam-publish-title-icon[data-part="publish"]', { after: 1500 });
    await h.click(p.locator('input[aria-label="API key"]'), { after: 200 });
    await p.keyboard.press("Control+V"); await h.wait(1800);
    await h.click(p.getByRole("button", { name: "Save", exact: true }), { after: 2600 });
  } });
};
for (const name of process.argv.slice(2)) await clips[name]();
