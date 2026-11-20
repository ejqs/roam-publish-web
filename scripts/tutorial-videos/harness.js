// A Roam-like page that loads the real extension.js with a fake roamAlphaAPI and a fake roam.pub.
const qs = new URLSearchParams(location.search);
const scene = qs.get("scene") || "hero";
if (qs.get("dark")) document.body.classList.add("dark");

const NOW = Date.now();
const GRAPH = qs.get("graph") || "ejqs";
const PUBLISHED_AT = "2026-10-20T09:14:00";

// ---- graph ----
const B = (uid, string, children = [], extra = {}) => ({ uid, string, children, ...extra });
const graphs = {
  hero: {
    page: { uid: "dispossd1", title: "The Dispossessed" },
    blocks: [
      B("blkauthor", "Author:: [[Ursula K. Le Guin]]"),
      B("blkanarre", "Anarres and Urras are two answers #essay", [
        B("blkshevek", "Shevek's walls, from the [[Hainish Cycle]]"),
        B("blkodotru", "Odo: true voyage is return"),
      ]),
      B("blkending", qs.get("lock") ? "The ending doesn't resolve anything, see my [[Reading diary]]" : "The ending doesn't resolve anything"),
    ],
    edited: ["blkanarre", "blkodotru"],
  },
  publish: {
    page: { uid: "readnote1", title: "Reading notes" },
    blocks: [
      B("rnblock01", "Notes on [[Deep Work]] and [[Spaced repetition]] #essay"),
      B("rnblock02", "Started [[The Dispossessed]] again, and [[Braiding Sweetgrass]]"),
      B("rnblock03", "Unsorted: [[Inbox]]"),
    ],
    edited: [],
  },
};
const g = graphs[scene] ?? graphs.hero;
const page = { ...g.page, children: g.blocks };

// Pages linked from the text exist too, so links resolve.
const titles = new Map(); // title -> uid
const byUid = new Map();
let n = 0;
const pageFor = (t) => {
  if (!titles.has(t)) {
    const uid = `pg${String(n++).padStart(7, "0")}`;
    titles.set(t, uid);
    byUid.set(uid, { uid, title: t, children: [] });
  }
  return titles.get(t);
};
const parent = new Map();
const index = (b, pageUid) => {
  byUid.set(b.uid, b);
  if (b.title) titles.set(b.title, b.uid);
  (b.children || []).forEach((c, i) => {
    c.order = i;
    parent.set(c.uid, b.uid);
    c.pageUid = pageUid;
    index(c, pageUid);
  });
};
index(page, page.uid);
const REF = /\[\[([^\]]+)\]\]|#([\w-]+)/g;
const refsOf = (s) => [...(s || "").matchAll(REF)].map((m) => m[1] || m[2]);
for (const b of [...byUid.values()]) for (const t of refsOf(b.string)) pageFor(t);
for (const t of ["Ursula K. Le Guin", "The Dispossessed", "Reading diary", "essay", "Deep Work", "Spaced repetition", "Inbox"]) pageFor(t);

const toPull = (b) => ({
  ":block/uid": b.uid,
  ...(b.string !== undefined && { ":block/string": b.string }),
  ...(b.title !== undefined && { ":node/title": b.title }),
  ":block/order": b.order ?? 0,
  ":block/open": true,
  ...(b.pageUid && { ":block/page": { ":block/uid": b.pageUid } }),
  ...(b.children?.length && { ":block/children": b.children.map(toPull) }),
});
const pull = async (_p, eid) => {
  const uid = /^\[:block\/uid "(.+)"\]$/.exec(eid)?.[1];
  if (uid) return byUid.has(uid) ? toPull(byUid.get(uid)) : null;
  const t = /^\[:node\/title "(.+)"\]$/.exec(eid)?.[1]?.replace(/\\(.)/g, "$1");
  return t && titles.has(t) ? toPull(byUid.get(titles.get(t))) : null;
};
const editedAt = Date.parse(PUBLISHED_AT) + 3600_000;
const q = async (query, arg) => {
  const s = query.replace(/\s+/g, " ");
  if (s.includes(":edit/time")) return arg.map((u) => [u, g.edited.includes(u) ? editedAt : Date.parse(PUBLISHED_AT) - 86400_000]);
  if (s.startsWith("[:find ?u . :in $ ?t")) return titles.get(arg) ?? null;
  if (s.startsWith("[:find ?u ?t :in $ [?u ...]")) return arg.filter((u) => byUid.get(u)?.title).map((u) => [u, byUid.get(u).title]);
  if (s.startsWith("[:find ?pu . :in $ ?u")) return byUid.get(arg)?.pageUid ?? null;
  if (s.includes(":block/refs")) return [...new Set(arg.flatMap((u) => refsOf(byUid.get(u)?.string)))].map((t) => [titles.get(t), t]);
  if (s.startsWith("[:find ?u ?pu ?t")) return arg.filter((u) => byUid.get(u)?.pageUid).map((u) => [u, byUid.get(u).pageUid, byUid.get(byUid.get(u).pageUid).title]);
  if (s.startsWith("[:find ?t . :in $ ?u")) return byUid.get(arg)?.title ?? null;
  console.warn("unhandled q", s);
  return [];
};

window.roamAlphaAPI = {
  graph: { name: GRAPH, type: "hosted", isEncrypted: false },
  data: { async: { q, pull }, block: { create: async () => {}, update: async () => {}, delete: async () => {} } },
  ui: {
    getFocusedBlock: () => null,
    mainWindow: { getOpenPageOrBlockUid: async () => page.uid, getOpenView: async () => ({ type: "outline", uid: page.uid }) },
    blockContextMenu: { addCommand() {}, removeCommand() {} },
    pageContextMenu: { addCommand() {}, removeCommand() {} },
  },
  util: { generateUID: () => Math.random().toString(36).slice(2, 11), dateToPageUid: () => "11-11-2026" },
};

// ---- roam.pub ----
const pub = (rootUid, kind, title, listing, extra = {}) => ({
  rootUid, kind, title, url: `https://roam.pub/ejqs/${rootUid}`, shortUrl: `https://roam.pub/p/${rootUid}`, anchorUid: null, places: 1,
  contentHash: extra.hash ?? "stale", visibility: listing === "unlisted" ? "unlisted" : "public", listing,
  discoverBlocked: null, listedNote: null, inGraph: true, encrypted: false, access: extra.access ?? "open",
  updatedAt: PUBLISHED_AT, removed: false, mine: true, folded: [],
});
const { serialize, hashPayload } = await import("./hasher.js");
const sb = await serialize("blkending");
const hashes = { blkending: sb ? await hashPayload(sb) : "x" };
const publications = scene === "publish"
  ? [
      pub(titles.get("The Dispossessed"), "page", "The Dispossessed", "listed"),
      pub(titles.get("essay"), "page", "essay", "unlisted"),
      pub(titles.get("Deep Work"), "page", "Deep Work", "listed"),
    ]
  : [
      pub("dispossd1", "page", "The Dispossessed", qs.get("listing") || "listed"),
      pub("blkending", "block", "The ending", "listed", { hash: hashes.blkending }),
      pub(titles.get("Ursula K. Le Guin"), "page", "Ursula K. Le Guin", "listed"),
      pub(titles.get("essay"), "page", "essay", "unlisted"),
      pub(titles.get("Reading diary"), "page", "Reading diary", "unlisted", { access: "password" }),
    ];

const place = (listing) => ({
  listing, discoverBlocked: null, access: "open", showAuthor: "inherit", views: "inherit", pdfDownload: "inherit",
  defaults: { showAuthor: "show", views: "show", pdfDownload: "off" },
});
const parseBody = (init) => { try { return JSON.parse(init.body || "{}"); } catch { return {}; } };
let graphPlace = null;
const LISTING_VIS = (l) => (l === "unlisted" ? "unlisted" : "public");
const dashStats = (period) => {
  const days = period === "7" ? 7 : 30;
  const byDay = Array.from({ length: days }, (_, i) => {
    const d = new Date(NOW - (days - 1 - i) * 86400_000).toISOString().slice(0, 10);
    return { day: d, views: Math.round(18 + 14 * Math.sin(i / 2.3) + (i * 7) % 11 + i * 0.8) };
  });
  const total = byDay.reduce((a, b) => a + b.views, 0);
  return { period, from: byDay[0].day, dailySince: byDay[0].day, pages: 14, blocks: 3, encrypted: 1,
    views: { total: 4210, period: total, byDay }, upvotes: { total: 61, period: 9 },
    countries: ["US", "GB", "DE", "PH", "CA", "JP", "FR", "AU"].map((code, i) => ({ code, views: 300 - i * 34 })),
    top: [["The Dispossessed", 512, 9], ["Reading notes", 341, 6], ["Deep Work", 208, 4], ["essay", 97, 1]].map(([title, views, upvotes], i) =>
      ({ rootUid: `top${i}xxxxx`, kind: "page", title, encrypted: false, url: "https://roam.pub/ejqs/x", views, upvotes })),
    firstPublishedAt: "2026-09-02T10:00:00Z", publishingDays: 79,
    collections: [{ id: "c1", name: "Reading notes", url: "https://roam.pub/c/reading", role: "owner", pages: 12 }] };
};
const memberOf = [{ ...place("discover"), id: "c1", name: "Reading notes", url: "https://roam.pub/c/reading", canManage: true }];
const routes = [
  [/\/collections$/, (path, init) => {
    if (init.method !== "POST") return null;
    const { collectionId } = parseBody(init);
    const name = collectionId === "c2" ? "Science fiction" : "Reading notes";
    memberOf.push({ ...place("listed"), id: collectionId, name, url: "https://roam.pub/c/scifi", canManage: true });
    return { name, entryUrl: "https://roam.pub/c/scifi/x", listing: "listed", access: "open", movedOutOfGraph: false, url: "https://roam.pub/ejqs/x" };
  }],
  [/^\/api\/ext\/stats\?period=(7|30|all)$/, (path) => dashStats(path.split("=").pop())],
  [/^\/api\/ext\/publications$/, (path, init) => {
    if ((init.method || "GET") !== "POST") return null;
    const b = parseBody(init);
    const existing = publications.find((p) => p.rootUid === b.rootUid);
    const p = existing || pub(b.rootUid, b.kind, b.title, "unlisted");
    p.contentHash = b.contentHash; p.updatedAt = new Date().toISOString();
    if (!existing) publications.push(p);
    return { status: existing ? "updated" : "created", url: p.url, shortUrl: p.shortUrl, contentHash: b.contentHash,
      visibility: p.visibility, listing: p.listing, discoverBlocked: null, inGraph: true, encrypted: false };
  }],
  [/^\/api\/ext\/publications\/([^/]+)$/, (path, init) => {
    if (init.method !== "PATCH") return null;
    const uid = decodeURIComponent(path.split("/").pop());
    const b = parseBody(init);
    const p = publications.find((x) => x.rootUid === uid);
    if (p && b.listing) { p.listing = b.listing; p.visibility = LISTING_VIS(b.listing); }
    if (graphPlace) Object.assign(graphPlace, b);
    return { listing: p?.listing ?? b.listing, visibility: LISTING_VIS(p?.listing ?? b.listing), discoverBlocked: null, listedNote: null, inGraph: true };
  }],
  [/^\/api\/ext\/publications$/, () => ({ publications, changeLog: null })],
  [/^\/api\/ext\/changelog$/, () => ({ graphName: GRAPH, changeLog: null })],
  [/\/stats\?period=7$/, () => ({
    views: { total: 512, period: 38, byDay: [] }, upvotes: { total: 9, period: 2 },
    countries: ["US", "GB", "DE", "PH", "CA", "JP"].map((code, i) => ({ code, views: 100 - i * 10 })),
  })],
  [/\/settings$/, () => {
    graphPlace ??= { ...place(qs.get("listing") || "listed"), name: GRAPH, inGraph: true, url: `https://roam.pub/${GRAPH}`, listingBlocked: null };
    return { encrypted: false, manageUrl: "https://roam.pub/dashboard", graph: graphPlace,
      collections: memberOf };
  }],
  [/^\/api\/ext\/places$/, () => ({
    graph: { name: GRAPH, access: "open", encrypted: false, encryptBlocked: null },
    collections: [{ id: "c1", name: "Reading notes", access: "open", listing: "discover", encrypted: false }],
    newPagesGoTo: ["graph"],
  })],
  [/\/collections$/, () => ({ collections: [
    { id: "c1", name: "Reading notes", listing: "discover", access: "open", entryUrl: "https://roam.pub/c/reading/x", movesOutOfGraph: false },
    { id: "c2", name: "Science fiction", listing: "listed", access: "open", entryUrl: null, movesOutOfGraph: false },
  ] })],
];
window.fetch = async (url, init = {}) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  let body = null, r = null;
  for (const route of routes) { if (route[0].test(path)) { body = route[1](path, init); if (body) { r = route; break; } } }
  if (!r) { console.warn("unhandled fetch", init.method || "GET", path, init.body || ""); body = { error: "not found" }; }
  return new Response(JSON.stringify(body), { status: r ? 200 : 404, headers: { "content-type": "application/json", "x-roam-publish-min-version": "0.1.0" } });
};

// ---- extension settings ----
const settings = new Map(Object.entries({
  ...(qs.get("nokey") ? {} : { "api-key": "rp_demo" }), "status-in-roam": "Titles and blocks", "top-bar-button": true, "shortlink-add": "Off",
  "collapsed-blocks": "As in Roam", "shortlink-tag": "[[Roam Publish]]", "shortlink-position": "First",
}));
const extensionAPI = {
  settings: { get: (k) => settings.get(k), set: async (k, v) => void settings.set(k, v), panel: { create() {} } },
  ui: { commandPalette: { addCommand() {}, removeCommand() {} } },
};

// ---- DOM ----
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const render = (s) =>
  esc(s)
    .replace(/^(\w[\w ]*)::/, '<span class="rm-attr-ref">$1:</span>')
    .replace(/\[\[([^\]]+)\]\]/g, (_, t) => `<span data-link-title="${t}" data-link-uid="${titles.get(t)}"><span class="rm-page-ref__brackets">[[</span><span tabindex="-1" class="rm-page-ref rm-page-ref--link">${t}</span><span class="rm-page-ref__brackets">]]</span></span>`)
    .replace(/(^|\s)#([\w-]+)/g, (_, sp, t) => `${sp}<span tabindex="-1" data-tag="${t}" class="rm-page-ref rm-page-ref--tag">#${t}</span>`);
const blockHtml = (b) => `
  <div class="roam-block-container">
    <div class="rm-block-main">
      <div class="controls rm-block__controls"><span class="rm-bullet"><span class="rm-bullet__inner"></span></span></div>
      <div class="roam-block dont-unfocus-block" id="block-input-main0window-${b.uid}"><span>${render(b.string)}</span></div>
    </div>
    ${b.children?.length ? `<div class="rm-block-children">${b.children.map(blockHtml).join("")}</div>` : ""}
  </div>`;
document.getElementById("article").innerHTML = `<div><h1 class="rm-title-display"><span>${esc(page.title)}</span></h1>
  <div class="rm-block-children">${page.children.map(blockHtml).join("")}</div></div>`;

const ext = await import("./extension.js");
await ext.default.onload({ extensionAPI });
window.__ready = true;
