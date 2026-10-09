import { z } from "zod";
import type { Access, PlacePdf } from "@/db/schema";

/**
 * Whether readers get a Download PDF button on a page: its own setting, or else its graph's or
 * collection's. Off unless someone turned it on. It only offers the print layout; it can't stop
 * anyone who can read the page from printing or copying it.
 */
export const offersPdf = (c: { pdfDownload: boolean }, p: { pdfDownload: PlacePdf }) =>
  p.pdfDownload === "inherit" ? c.pdfDownload : p.pdfDownload === "on";

/** How a downloaded page treats folded blocks: all opened, or as the reader left them on screen. */
export type PdfFolds = "expanded" | "as-shown";

export const PDF_PAPERS = ["auto", "a4", "letter"] as const;
export const PDF_FONTS = ["sans", "serif"] as const;
export const PDF_SIZES = ["small", "normal", "large"] as const;

/** How a graph's or collection's downloaded PDFs look. Its pages all use it. */
export const PdfStyleInput = z.object({
  /** "auto" leaves it to the reader's printer settings. */
  paper: z.enum(PDF_PAPERS),
  font: z.enum(PDF_FONTS),
  size: z.enum(PDF_SIZES),
  /** The byline, where the page shows one. */
  author: z.boolean(),
  tags: z.boolean(),
  /** "Downloaded {date}" in the masthead, so an old copy reads as old. */
  downloaded: z.boolean(),
  /** The page's roam.pub link at the foot of every sheet. */
  link: z.boolean(),
  pageNumbers: z.boolean(),
  /** Roam's thin lines beside nested blocks. */
  threads: z.boolean(),
  /**
   * Every download uses this style. Off, readers can change any of the above for their own copy,
   * starting from these choices.
   */
  enforced: z.boolean(),
});
export type PdfStyle = z.infer<typeof PdfStyleInput>;

export const PDF_STYLE_DEFAULTS: PdfStyle = {
  paper: "auto",
  font: "sans",
  size: "normal",
  author: true,
  tags: true,
  downloaded: true,
  link: true,
  pageNumbers: true,
  threads: true,
  enforced: false,
};

/** A stored style with any missing choice (one added since it was saved) filled from the defaults. */
export const pdfStyleOf = (stored: Partial<PdfStyle> | null | undefined): PdfStyle => ({ ...PDF_STYLE_DEFAULTS, ...stored });

export const PDF_PAPER_LABELS = { auto: "Reader's default", a4: "A4", letter: "Letter" } as const;
export const PDF_FONT_LABELS = { sans: "Sans", serif: "Serif" } as const;
export const PDF_SIZE_LABELS = { small: "Small", normal: "Normal", large: "Large" } as const;
/** Body text size in points. */
export const PDF_SIZE_PT = { small: 9.5, normal: 10.5, large: 12 } as const;

/**
 * The `@page` rules for a style: paper size and what the footer of every sheet carries. They can't
 * live in the stylesheet because the link and the choices differ per page.
 */
export function pdfPageCss(style: PdfStyle, link: string) {
  const size = style.paper === "a4" ? "A4" : style.paper === "letter" ? "letter" : "auto";
  const box = (content: string) =>
    `content: ${content}; font: 7.5pt var(--font-sans); color: #738091; vertical-align: top; padding-top: 6mm;`;
  const left = style.link ? `@bottom-left { ${box(JSON.stringify(link))} }` : "";
  const right = style.pageNumbers ? `@bottom-right { ${box(`counter(page) " / " counter(pages)`)} }` : "";
  return `@page { size: ${size}; margin: 20mm 20mm 22mm; ${left} ${right} }`;
}

/** "roam.pub/notes/abc/title": a page's address as the footer of its PDF prints it. */
export function pdfLink(path: string) {
  const url = new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  return url.host + decodeURIComponent(url.pathname);
}

/** What a page's Download PDF needs (components/pdf-download.tsx), or undefined when this place doesn't offer it. */
export function pdfOffer(
  c: { pdfDownload: boolean; pdfStyle: Partial<PdfStyle> | null },
  p: { pdfDownload: PlacePdf },
  page: { path: string; source: string; access: Access; updatedAt: Date; author?: string },
) {
  if (!offersPdf(c, p)) return undefined;
  return {
    style: pdfStyleOf(c.pdfStyle),
    link: pdfLink(page.path),
    source: page.source,
    protected: page.access !== "open",
    updated: page.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" }),
    author: page.author,
  };
}
