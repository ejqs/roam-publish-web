import { record } from "./rec.mjs";
const OUT = process.env.OUT || new URL("../../public/tutorials", import.meta.url).pathname;
const H = (scene, extra = "") => `http://localhost:8766/index.html?scene=${scene}${extra}`;
const ready = async (p) => { await p.waitForFunction(() => window.__ready); await p.waitForTimeout(1800); };
const W = 960, Ht = 540, S = 2;
const base = (scene) => ({ url: H(scene), width: W, height: Ht, scale: S, setup: ready });
const btn = (p, name) => p.getByRole("button", { name, exact: true }).first();
const title = "h1.rm-title-display";
const icon = (part) => `.roam-publish-title-icon[data-part="${part}"]`;

const clips = {
  async publish() {
    await record({ ...base("publish"), out: `${OUT}/publish.mp4`, async script(h) {
      await h.wait(700);
      await h.to(title, { dx: 0.4 }); await h.wait(500);
      await h.click(icon("publish"), { after: 1400 });
      await h.click(btn(h.p, "Public"), { after: 1100 });
      await h.click(btn(h.p, "Publish page"), { after: 2800 });
      await h.to(icon("status"), { ms: 600 }); await h.wait(1500);
    } });
  },
  async visibility() {
    await record({ ...base("hero"), out: `${OUT}/visibility.mp4`, async script(h) {
      await h.wait(600);
      await h.to(title, { dx: 0.5 });
      await h.click(icon("settings"), { after: 1400 });
      await h.click(btn(h.p, "Unlisted"), { after: 900 });
      await h.click(btn(h.p, "Save"), { after: 1800 });
      await h.click(btn(h.p, "On Discover"), { after: 900 });
      await h.click(btn(h.p, "Save"), { after: 2200 });
    } });
  },
  async status() {
    await record({ ...base("hero"), out: `${OUT}/status.mp4`, async script(h) {
      await h.wait(700);
      await h.click(icon("status"), { after: 2000 });
      await h.click(btn(h.p, "Republish"), { after: 2200 });
      await h.click(icon("stats"), { after: 2400 });
      await h.p.keyboard.press("Escape"); await h.wait(300);
      await h.click(".roam-publish-topbar", { after: 3200 });
    } });
  },
  async pdf() {
    await record({ ...base("hero"), out: `${OUT}/pdf.mp4`, async script(h) {
      await h.wait(600);
      await h.to(title, { dx: 0.5 });
      await h.click(icon("settings"), { after: 1300 });
      const sel = h.p.locator("select").nth(2);
      await h.to(sel); await h.wait(250);
      await sel.selectOption("on"); await h.wait(900);
      await h.click(btn(h.p, "Save"), { after: 2200 });
    } });
  },
  async collections() {
    await record({ ...base("hero"), out: `${OUT}/collections.mp4`, async script(h) {
      await h.wait(600);
      await h.to(title, { dx: 0.5 });
      await h.click(icon("settings"), { after: 1300 });
      const sel = h.p.locator("select").nth(3);
      await h.to(sel); await h.wait(250);
      await sel.selectOption("c2"); await h.wait(900);
      await h.click(btn(h.p, "Add"), { after: 2600 });
    } });
  },
};
for (const name of process.argv.slice(2)) await clips[name]();
