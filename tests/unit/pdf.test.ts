import { describe, expect, test } from "bun:test";
import { offersPdf, PDF_STYLE_DEFAULTS, type PdfStyle, pdfPageCss, pdfStyleOf } from "@/lib/pdf";

describe("offersPdf", () => {
  test("a page that inherits follows its graph or collection", () => {
    expect(offersPdf({ pdfDownload: false }, { pdfDownload: "inherit" })).toBe(false);
    expect(offersPdf({ pdfDownload: true }, { pdfDownload: "inherit" })).toBe(true);
  });

  test("a page's own setting wins either way", () => {
    expect(offersPdf({ pdfDownload: false }, { pdfDownload: "on" })).toBe(true);
    expect(offersPdf({ pdfDownload: true }, { pdfDownload: "off" })).toBe(false);
  });
});

describe("pdfStyleOf", () => {
  test("no stored style is the defaults", () => expect(pdfStyleOf(null)).toEqual(PDF_STYLE_DEFAULTS));
  test("a choice added later falls back to its default", () =>
    expect(pdfStyleOf({ font: "serif" } as Partial<PdfStyle>)).toEqual({ ...PDF_STYLE_DEFAULTS, font: "serif" }));
});

describe("pdfPageCss", () => {
  test("paper size and both footer boxes by default", () => {
    const css = pdfPageCss(PDF_STYLE_DEFAULTS, "roam.pub/notes/abc");
    expect(css).toContain("size: auto");
    expect(css).toContain('"roam.pub/notes/abc"');
    expect(css).toContain("counter(pages)");
  });
  test("footer parts the owner turned off are left out", () => {
    const css = pdfPageCss({ ...PDF_STYLE_DEFAULTS, paper: "a4", link: false, pageNumbers: false }, "x");
    expect(css).toContain("size: A4");
    expect(css).not.toContain("@bottom-left");
    expect(css).not.toContain("@bottom-right");
  });
  test("a link can't break out of the CSS string", () =>
    expect(pdfPageCss(PDF_STYLE_DEFAULTS, 'a"; } body { display: none')).toContain('"a\\"; } body { display: none"'));
});
