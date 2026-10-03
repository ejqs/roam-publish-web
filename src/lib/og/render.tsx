import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { PreviewCard } from "@/lib/link-preview";

/**
 * Draws a page's "graph card" (1200×630): the page's title, an excerpt and Roam-style attributes on
 * the left, and the page with the pages it links to on the right, like a corner of Roam's graph
 * view. Colours are the site's light theme. The image renderer can't use system fonts, so it draws
 * with Noto Sans, which covers Latin, Greek, Cyrillic, Vietnamese and Devanagari.
 */

const INK = "#1c2127";
const MUTED = "#5f6b7c";
const LINK = "#106ba3";
const PRIMARY = "#2d72d2";
const BULLET = "#5c7080";
const PANEL = "#f6f7f9";
const RULE = "#dce0e5";
const EDGE = "#c5cbd3";

const SUBSETS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese", "devanagari"];

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    SUBSETS.flatMap((subset) =>
      ([400, 700] as const).map(async (weight) => ({
        name: "Noto Sans",
        data: await readFile(
          join(process.cwd(), "node_modules/@fontsource/noto-sans/files", `noto-sans-${subset}-${weight}-normal.woff`),
        ),
        weight,
        style: "normal" as const,
      })),
    ),
  );
  return fonts;
}

/** The panel's size, and where the page (centre) and up to five linked pages sit in it. */
const PANEL_W = 440;
const CENTRE = { x: 220, y: 290 };
const SLOTS = [
  { x: 96, y: 128 },
  { x: 336, y: 112 },
  { x: 368, y: 330 },
  { x: 292, y: 470 },
  { x: 78, y: 420 },
];
const LABEL_W = 180;

/**
 * The page links to the card with a version that changes with its content, so a day's cache is safe;
 * a changed setting (a page made protected) reaches the image within that day at the latest.
 */
export const CARD_CACHE = "public, max-age=86400";

const initial = (s: string) => (Array.from(s.trim())[0] ?? "?").toUpperCase();

export async function renderCard(card: PreviewCard, cacheControl: string) {
  return new ImageResponse(card.locked ? <LockedCard card={card} /> : <OpenCard card={card} />, {
    width: 1200,
    height: 630,
    fonts: await loadFonts(),
    headers: { "Cache-Control": cacheControl },
  });
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff", color: INK, fontFamily: "Noto Sans" }}>
      {children}
    </div>
  );
}

function ContainerLine({ name }: { name: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 2,
          background: PRIMARY,
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 21,
          fontWeight: 700,
        }}
      >
        {initial(name)}
      </div>
      <div style={{ display: "flex", fontWeight: 700, maxWidth: 560, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
        {name}
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div style={{ position: "absolute", right: 28, bottom: 28, display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 30,
          height: 30,
          background: PRIMARY,
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        RP
      </div>
      <div style={{ display: "flex", fontSize: 20, fontWeight: 700 }}>roam.pub</div>
    </div>
  );
}

function Attribute({ name, value, link }: { name: string; value: string; link?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, maxWidth: 300 }}>
      <span style={{ fontWeight: 700 }}>{name}::</span>
      <span style={{ color: link ? LINK : INK, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{value}</span>
    </div>
  );
}

function OpenCard({ card }: { card: Extract<PreviewCard, { locked: false }> }) {
  // No links: draw its tags around it instead.
  const nodes = card.links.length ? card.links : card.tags.map((t) => `#${t}`);
  const slots = SLOTS.slice(0, nodes.length);
  return (
    <Frame>
      <div style={{ width: 760, display: "flex", flexDirection: "column", padding: "64px 56px 56px 72px" }}>
        <ContainerLine name={card.container} />
        <div
          style={{
            display: "block",
            marginTop: 26,
            fontSize: card.title.length > 60 ? 50 : 58,
            lineHeight: 1.12,
            fontWeight: 700,
            letterSpacing: "-0.015em",
            lineClamp: 3,
          }}
        >
          {card.title}
        </div>
        {card.description && (
          <div style={{ display: "block", marginTop: 22, fontSize: 25, lineHeight: 1.42, color: MUTED, lineClamp: 2 }}>
            {card.description}
          </div>
        )}
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", gap: 34, fontSize: 24 }}>
          {card.author && <Attribute name="Author" value={card.author} link />}
          {card.tags.length > 0 && <Attribute name="Tags" value={`#${card.tags[0]}`} link />}
          <Attribute name="Read" value={`${card.minutes} min`} />
        </div>
      </div>
      <div style={{ display: "flex", flexGrow: 1, position: "relative", background: PANEL, borderLeft: `2px solid ${RULE}` }}>
        <svg width={PANEL_W} height={630} viewBox={`0 0 ${PANEL_W} 630`} style={{ position: "absolute", left: 0, top: 0 }}>
          {slots.map((s, i) => (
            <line key={i} x1={CENTRE.x} y1={CENTRE.y} x2={s.x} y2={s.y} stroke={EDGE} strokeWidth={2.5} />
          ))}
          {nodes.length === 0 && <circle cx={CENTRE.x} cy={CENTRE.y} r={110} fill="none" stroke={EDGE} strokeWidth={2} strokeDasharray="6 8" />}
          <circle cx={CENTRE.x} cy={CENTRE.y} r={30} fill="rgba(45,114,210,0.15)" />
          <circle cx={CENTRE.x} cy={CENTRE.y} r={15} fill={PRIMARY} />
          {slots.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={9} fill={BULLET} />
          ))}
        </svg>
        {slots.map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: Math.min(Math.max(s.x - LABEL_W / 2, 8), PANEL_W - LABEL_W - 8),
              top: s.y + 18,
              width: LABEL_W,
              display: "flex",
              justifyContent: "center",
              fontSize: 19,
              color: LINK,
            }}
          >
            <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{nodes[i]}</span>
          </div>
        ))}
        <Brand />
      </div>
    </Frame>
  );
}

function LockedCard({ card }: { card: Extract<PreviewCard, { locked: true }> }) {
  return (
    <Frame>
      <div style={{ width: 760, display: "flex", flexDirection: "column", padding: "64px 56px 56px 72px" }}>
        <ContainerLine name={card.container} />
        <div style={{ display: "flex", marginTop: 26, fontSize: 58, lineHeight: 1.12, fontWeight: 700 }}>Protected page</div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 25, lineHeight: 1.42, color: MUTED }}>
          Open the link to unlock it.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexGrow: 1,
          position: "relative",
          alignItems: "center",
          justifyContent: "center",
          background: PANEL,
          borderLeft: `2px solid ${RULE}`,
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            background: "rgba(45,114,210,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="16" r="1" />
            <rect x="3" y="10" width="18" height="12" rx="2" />
            <path d="M7 10V7a5 5 0 0 1 10 0v3" />
          </svg>
        </div>
        <Brand />
      </div>
    </Frame>
  );
}
