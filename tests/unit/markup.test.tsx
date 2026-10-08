import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { languageLabel } from "@/components/roam/code-block";
import { isMermaid, mermaidSource, PageLinks, RoamText } from "@/components/roam/markup";

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

describe("nested page refs", () => {
  const render = (text: string, links: [string, string][]) =>
    renderToStaticMarkup(<RoamText text={text} links={new PageLinks(links)} />);

  test("the inner ref links even when the outer page isn't published", () => {
    const out = render("[[Outer [[Inner]] title]]", [["inner", "/g/inner"]]);
    expect(out).toContain('<a class="text-roam-ref hover:underline" href="/g/inner">Inner</a>');
    expect(out).not.toContain("[[");
  });

  test("outer and inner each link to their own page, never one inside the other", () => {
    const out = render("[[Outer [[Inner]] title]]", [
      ["outer [[inner]] title", "/g/outer"],
      ["inner", "/g/inner"],
    ]);
    expect(out).toContain('href="/g/outer">Outer </a>');
    expect(out).toContain('href="/g/inner">Inner</a>');
    expect(out).toContain('href="/g/outer"> title</a>');
    expect(out).not.toMatch(/<a[^>]*>[^<]*<a/);
  });

  test("tags and several inner refs", () => {
    const out = render("#[[[[A]] and [[B]]]]", [["a", "/g/a"], ["b", "/g/b"]]);
    expect(out).toContain('href="/g/a">A</a>');
    expect(out).toContain('href="/g/b">B</a>');
    expect(out).toContain(">#</span>");
  });

  test("refs to unpublished pages are marked, not linked", () => {
    for (const text of ["[[Missing]]", "[label]([[Missing]])", "#[[Missing]]", "[[Missing [[Inner]]]]"]) {
      const out = render(text, [["inner", "/g/inner"]]);
      expect(out).toContain('title="This page isn&#x27;t published"');
      expect(out).not.toContain("Missing</a>");
    }
  });
});

describe("mermaid and code blocks", () => {
  const block = (string: string, children: { string: string; children: never[] }[] = []) => ({ string, children });

  test("a {{mermaid}} block's children are its source, indented by depth", () => {
    const src = mermaidSource([
      { string: "mindmap", children: [{ string: "root", children: [block("a"), block("b")] }] },
    ]);
    expect(src).toBe("mindmap\n  root\n    a\n    b");
    expect(mermaidSource([block("graph TD"), block("A --> B")])).toBe("graph TD\nA --> B");
  });

  test("mermaid is recognised however Roam writes it", () => {
    expect(isMermaid("{{mermaid}}")).toBe(true);
    expect(isMermaid("{{[[mermaid]]}}")).toBe(true);
    expect(isMermaid("{{drawing}}")).toBe(false);
  });

  test("the component itself draws nothing in the text; other diagrams still say they're hidden", () => {
    expect(html("{{mermaid}}")).toBe("<span></span>");
    expect(html("{{drawing}}")).toContain("Diagram not shown");
  });

  test("code blocks name their language", () => {
    expect(languageLabel("js")).toBe("JavaScript");
    expect(languageLabel("c++")).toBe("C++");
    expect(languageLabel("")).toBe("Plain text");
    expect(languageLabel("Plain Text")).toBe("Plain text");
    expect(languageLabel("madeup")).toBe("madeup");
  });
});
