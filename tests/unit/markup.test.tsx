import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageLinks, RoamText } from "@/components/roam/markup";

const html = (text: string) => renderToStaticMarkup(<RoamText text={text} links={new PageLinks()} />);

describe("RoamText never renders script", () => {
  const attacks = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "[click](javascript:alert(1))",
    "[click](JAVASCRIPT:alert(1))",
    "[click](data:text/html,<script>alert(1)</script>)",
    "![x](javascript:alert(1))",
    '![x](https://a.example/x.png" onerror="alert(1))',
    "{{iframe: javascript:alert(1)}}",
    "{{iframe: data:text/html,<script>alert(1)</script>}}",
    "{{video: javascript:alert(1)}}",
    "{{pdf: javascript:alert(1)}}",
    String.raw`$$\href{javascript:alert(1)}{x}$$`,
    String.raw`$$\htmlId{x}{y}$$`,
    String.raw`$$\url{javascript:alert(1)}$$`,
    "**<b onmouseover=alert(1)>x</b>**",
  ];
  for (const a of attacks)
    test(JSON.stringify(a), () => {
      const out = html(a);
      expect(out).not.toMatch(/<script/i);
      expect(out).not.toMatch(/<[^>]*\son\w+=/i);
      expect(out).not.toMatch(/(href|src|data)="\s*(javascript|data|vbscript):/i);
    });
});

describe("embeds", () => {
  test("iframes are sandboxed and never point at roam.pub itself", () => {
    const out = html("{{iframe: https://example.com/page}}");
    expect(out).toContain('sandbox="');
    expect(out).toContain('src="https://example.com/page"');
    expect(html("{{iframe: http://localhost:3000/evil}}")).not.toContain("<iframe");
  });

  test("a PDF from roam.pub itself isn't embedded unsandboxed", () => {
    expect(html("{{pdf: http://localhost:3000/somepage}}")).not.toContain("<object");
  });

  test("a PDF from elsewhere is embedded", () => {
    expect(html("{{pdf: https://example.com/a.pdf}}")).toContain('<object data="https://example.com/a.pdf"');
  });

  test("links open safely", () => {
    const out = html("[x](https://example.com)");
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });
});
