// Records one tutorial clip from the harness (or any URL) as crisp frames via CDP screencast, then encodes MP4.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
// Playwright from this repo, or a global install (PLAYWRIGHT=/path/to/playwright).
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT ?? "playwright");

const CURSOR = `(() => {
  const add = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 11.5-6.6.9 3.9 7.4-2.9 1.5-3.8-7.5L4 20z" fill="#111418" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "-40px", top: "-40px", zIndex: 2147483647, pointerEvents: "none", transition: "transform .12s" , transformOrigin: "4px 2px"});
    const ring = document.createElement("div");
    Object.assign(ring.style, { position: "fixed", width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(45,114,210,.8)", zIndex: 2147483646, pointerEvents: "none", opacity: 0, transform: "translate(-50%,-50%) scale(.4)", transition: "opacity .35s, transform .35s" });
    document.documentElement.append(c, ring);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX - 4 + "px"; c.style.top = e.clientY - 2 + "px"; }, true);
    addEventListener("mousedown", (e) => { c.style.transform = "scale(.85)"; ring.style.left = e.clientX + "px"; ring.style.top = e.clientY + "px"; ring.style.transition = "none"; ring.style.opacity = 1; ring.style.transform = "translate(-50%,-50%) scale(.4)"; requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.transition = "opacity .4s, transform .4s"; ring.style.opacity = 0; ring.style.transform = "translate(-50%,-50%) scale(1.4)"; })); }, true);
    addEventListener("mouseup", () => { c.style.transform = ""; }, true);
  };
  if (document.documentElement) add(); else addEventListener("DOMContentLoaded", add);
  addEventListener("DOMContentLoaded", add);
})();`;

export async function record({ cookies, css, url, out, width = 1280, height = 720, scale = 1.5, colorScheme = "light", setup, script, storageState, extraHTTPHeaders }) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme, storageState, extraHTTPHeaders,
    permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript(CURSOR);
  if (cookies) await ctx.addCookies(cookies);
  if (css) await ctx.addInitScript(`addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(css)}; document.head.append(s); });`);
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console:", m.text()); });
  p.on("pageerror", (e) => console.log("error:", e.message));
  await p.goto(url);
  if (setup) await setup(p);
  const cdp = await ctx.newCDPSession(p);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  // Start the cursor somewhere neutral so the first frame has it.
  await p.mouse.move(width * 0.6, height * 0.75);
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: width * scale, maxHeight: height * scale });
  const t0 = Date.now() / 1000;
  await p.waitForTimeout(300);
  let mx = width * 0.6, my = height * 0.75;
  const h = {
    p, ctx,
    wait: (ms) => p.waitForTimeout(ms),
    async moveTo(x, y, ms = 700) {
      const steps = Math.max(8, Math.round(ms / 16));
      const sx = mx, sy = my;
      for (let i = 1; i <= steps; i++) {
        const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        await p.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
        await p.waitForTimeout(ms / steps);
      }
      mx = x; my = y;
    },
    async to(sel, { ms = 700, dx = 0.5, dy = 0.5 } = {}) {
      const l = typeof sel === "string" ? p.locator(sel).first() : sel;
      await l.waitFor({ state: "visible" });
      let bb = await l.boundingBox();
      if (bb.y < 0 || bb.y + bb.height > height) {
        await l.evaluate((e) => e.scrollIntoView({ behavior: "smooth", block: "center" }));
        await p.waitForTimeout(700);
        bb = await l.boundingBox();
      }
      await h.moveTo(bb.x + bb.width * dx, bb.y + bb.height * dy, ms);
      return l;
    },
    async click(sel, opts = {}) {
      await h.to(sel, opts);
      await p.waitForTimeout(150);
      await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up();
      await p.waitForTimeout(opts.after ?? 600);
    },
    async type(text, delay = 55) { await p.keyboard.type(text, { delay }); },
  };
  await script(h);
  await p.waitForTimeout(400);
  await cdp.send("Page.stopScreencast");
  const t1 = Date.now() / 1000;
  await b.close();

  // Frames only arrive when something changes; hold each one until the next.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tutorial-frames-"));
  const lines = [];
  frames.forEach((f, i) => {
    const file = `${dir}/${String(i).padStart(5, "0")}.png`;
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    const next = i + 1 < frames.length ? frames[i + 1].t : t1;
    lines.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(3)}`);
  });
  lines.push(`file '${dir}/${String(frames.length - 1).padStart(5, "0")}.png'`);
  fs.writeFileSync(`${dir}/list.txt`, lines.join("\n"));
  const W = Math.round(width * scale / 2) * 2, H = Math.round(height * scale / 2) * 2;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`,
    "-vf", `scale=${W}:${H}:flags=lanczos,fps=30,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "26",
    "-tune", "stillimage", "-movflags", "+faststart", "-an", out]);
  // Poster: the last frame, where the result shows.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-sseof", "-0.2", "-i", out, "-frames:v", "1", "-q:v", "4", out.replace(/\.mp4$/, ".jpg")]);
  fs.rmSync(dir, { recursive: true });
  console.log(out, `${frames.length} frames`, `${(t1 - t0).toFixed(1)}s`, `${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
