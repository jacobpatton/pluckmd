import { describe, expect, it } from "vitest";
import type { AdapterSpec, DomEvaluator, PageAnalysisInput } from "@harvest/shared";
import { GenericLinkCollector } from "../src/core/link-collector.js";

const baseSpec: AdapterSpec = {
  listing: {
    articleLinkSelector: 'a[href*="/posts/"]',
    articleLinkHrefPattern: "/posts/[^/]+/?$",
  },
  article: {
    method: "readability",
  },
  pagination: {
    method: "none",
  },
  evidence: "fixture",
};

function input(html: string): PageAnalysisInput {
  return {
    requestedUrl: "https://example.com/blog",
    finalUrl: "https://example.com/blog",
    status: 200,
    html,
    source: "static",
    renderMode: "never",
  };
}

describe("GenericLinkCollector", () => {
  it("collects non-paginated static links", async () => {
    const result = await new GenericLinkCollector().collectLinks(
      input(`
        <main>
          <a href="/posts/one">One</a>
          <a href="/posts/two">Two</a>
          <a href="/posts/three">Three</a>
        </main>
      `),
      baseSpec,
    );

    expect(result.stoppedBecause).toBe("complete");
    expect(result.iterations).toBe(1);
    expect(result.links.map((link) => link.url)).toEqual([
      "https://example.com/posts/one",
      "https://example.com/posts/two",
      "https://example.com/posts/three",
    ]);
  });

  it("follows static next-url pagination until no next link remains", async () => {
    const pages = new Map([
      [
        "https://example.com/blog/page/2",
        `<main>
          <a href="/posts/three">Three</a>
          <a href="/posts/four">Four</a>
          <a rel="next" href="/blog/page/3">Next</a>
        </main>`,
      ],
      [
        "https://example.com/blog/page/3",
        `<main>
          <a href="/posts/five">Five</a>
          <a href="/posts/six">Six</a>
        </main>`,
      ],
    ]);

    const collector = new GenericLinkCollector({
      fetchPage: async (url) => pages.get(url) ?? "",
    });
    const result = await collector.collectLinks(
      input(`
        <main>
          <a href="/posts/one">One</a>
          <a href="/posts/two">Two</a>
          <a rel="next" href="/blog/page/2">Next</a>
        </main>
      `),
      {
        ...baseSpec,
        pagination: {
          method: "next-url",
          selector: 'a[rel="next"]',
        },
      },
    );

    expect(result.stoppedBecause).toBe("complete");
    expect(result.iterations).toBe(3);
    expect(result.links).toHaveLength(6);
    expect(new Set(result.links.map((link) => link.url)).size).toBe(6);
  });

  it("honors user link limits", async () => {
    const result = await new GenericLinkCollector().collectLinks(
      input(`
        <main>
          <a href="/posts/one">One</a>
          <a href="/posts/two">Two</a>
          <a href="/posts/three">Three</a>
        </main>
      `),
      baseSpec,
      2,
    );

    expect(result.stoppedBecause).toBe("limit");
    expect(result.links).toHaveLength(2);
  });

  it("executes rendered button-click pagination through evaluator actions", async () => {
    let page = 0;
    const hrefPages = [
      [
        "https://example.com/posts/one",
        "https://example.com/posts/two",
      ],
      [
        "https://example.com/posts/one",
        "https://example.com/posts/two",
        "https://example.com/posts/three",
      ],
      [
        "https://example.com/posts/one",
        "https://example.com/posts/two",
        "https://example.com/posts/three",
      ],
    ];
    const evaluator: DomEvaluator = {
      async count() {
        return { value: 1 };
      },
      async text() {
        return { value: [] };
      },
      async hrefs() {
        return { value: hrefPages[page] ?? hrefPages.at(-1)! };
      },
      async click() {
        if (page >= 2) return { value: false };
        page++;
        return { value: true };
      },
      async clickByText() {
        return { value: false };
      },
      async scrollToBottom() {
        return { value: true };
      },
      async content() {
        return { value: `<main data-page="${page}"></main>` };
      },
      async currentUrl() {
        return { value: "https://example.com/blog" };
      },
      async wait() {},
    };

    const result = await new GenericLinkCollector({
      duplicateStaleLimit: 1,
    }).collectLinks(
      {
        ...input("<main></main>"),
        source: "rendered",
        renderMode: "always",
        evaluator,
      },
      {
        ...baseSpec,
        pagination: {
          method: "button-click",
          selector: "button",
        },
      },
    );

    expect(result.stoppedBecause).toBe("duplicates");
    expect(result.links.map((link) => link.url)).toEqual([
      "https://example.com/posts/one",
      "https://example.com/posts/two",
      "https://example.com/posts/three",
    ]);
  });

  it("falls back to scrolling after a load-more button disappears", async () => {
    let page = 0;
    const hrefPages = [
      [
        "https://example.com/posts/one",
        "https://example.com/posts/two",
      ],
      [
        "https://example.com/posts/one",
        "https://example.com/posts/two",
        "https://example.com/posts/three",
      ],
      [
        "https://example.com/posts/one",
        "https://example.com/posts/two",
        "https://example.com/posts/three",
        "https://example.com/posts/four",
      ],
      [
        "https://example.com/posts/one",
        "https://example.com/posts/two",
        "https://example.com/posts/three",
        "https://example.com/posts/four",
      ],
    ];
    const evaluator: DomEvaluator = {
      async count() {
        return { value: 1 };
      },
      async text() {
        return { value: [] };
      },
      async hrefs() {
        return { value: hrefPages[page] ?? hrefPages.at(-1)! };
      },
      async click() {
        if (page !== 0) return { value: false };
        page = 1;
        return { value: true };
      },
      async clickByText() {
        return { value: false };
      },
      async scrollToBottom() {
        if (page === 1) page = 2;
        return { value: true };
      },
      async content() {
        return { value: `<main data-page="${page}"></main>` };
      },
      async currentUrl() {
        return { value: "https://example.com/blog" };
      },
      async wait() {},
    };

    const result = await new GenericLinkCollector({
      duplicateStaleLimit: 1,
    }).collectLinks(
      {
        ...input("<main></main>"),
        source: "rendered",
        renderMode: "always",
        evaluator,
      },
      {
        ...baseSpec,
        pagination: {
          method: "button-click",
          selector: "button",
        },
      },
    );

    expect(result.links.map((link) => link.url)).toEqual([
      "https://example.com/posts/one",
      "https://example.com/posts/two",
      "https://example.com/posts/three",
      "https://example.com/posts/four",
    ]);
  });

  it("drives auto pagination with scroll and structural click candidates", async () => {
    let page = 0;
    let clickedCandidate = false;
    const evaluator: DomEvaluator = {
      async count() {
        return { value: 1 };
      },
      async text() {
        return { value: [] };
      },
      async hrefs() {
        return {
          value: page === 0
            ? ["https://example.com/posts/one", "https://example.com/posts/two"]
            : [
                "https://example.com/posts/one",
                "https://example.com/posts/two",
                "https://example.com/posts/three",
              ],
        };
      },
      async click() {
        return { value: false };
      },
      async clickByText() {
        return { value: false };
      },
      async clickPaginationCandidate() {
        clickedCandidate = true;
        page = 1;
        return { value: true };
      },
      async scrollToBottom() {
        return { value: true };
      },
      async content() {
        return { value: `<main data-page="${page}"></main>` };
      },
      async currentUrl() {
        return { value: "https://example.com/blog" };
      },
      async wait() {},
    };

    const result = await new GenericLinkCollector({
      duplicateStaleLimit: 1,
    }).collectLinks(
      {
        ...input("<main></main>"),
        source: "rendered",
        renderMode: "always",
        evaluator,
      },
      {
        ...baseSpec,
        pagination: { method: "auto" },
      },
    );

    expect(clickedCandidate).toBe(true);
    expect(result.links.map((link) => link.url)).toContain("https://example.com/posts/three");
  });

  it("stops rendered scroll pagination at max iterations", async () => {
    const evaluator: DomEvaluator = {
      async count() {
        return { value: 1 };
      },
      async text() {
        return { value: [] };
      },
      async hrefs() {
        return { value: ["https://example.com/posts/one"] };
      },
      async click() {
        return { value: false };
      },
      async clickByText() {
        return { value: false };
      },
      async scrollToBottom() {
        return { value: true };
      },
      async content() {
        return { value: `<main>${Date.now()}</main>` };
      },
      async currentUrl() {
        return { value: "https://example.com/blog" };
      },
      async wait() {},
    };

    const result = await new GenericLinkCollector({
      maxIterations: 2,
      duplicateStaleLimit: 100,
      unchangedDomLimit: 100,
    }).collectLinks(
      {
        ...input("<main></main>"),
        source: "rendered",
        renderMode: "always",
        evaluator,
      },
      {
        ...baseSpec,
        pagination: { method: "scroll" },
      },
    );

    expect(result.stoppedBecause).toBe("max-iterations");
    expect(result.iterations).toBe(2);
  });

  it("navigates rendered next-url pagination when the evaluator supports navigation", async () => {
    let currentUrl = "https://example.com/blog";
    const hrefsByUrl = new Map([
      [
        "https://example.com/blog",
        [
          "https://example.com/posts/one",
          "https://example.com/posts/two",
        ],
      ],
      [
        "https://example.com/blog/page/2",
        [
          "https://example.com/posts/three",
          "https://example.com/posts/four",
        ],
      ],
    ]);
    const evaluator: DomEvaluator = {
      async count() {
        return { value: 1 };
      },
      async text() {
        return { value: [] };
      },
      async hrefs(selector) {
        if (selector === 'a[rel="next"]') {
          return {
            value: currentUrl === "https://example.com/blog"
              ? ["https://example.com/blog/page/2"]
              : [],
          };
        }
        return { value: hrefsByUrl.get(currentUrl) ?? [] };
      },
      async click() {
        return { value: false };
      },
      async clickByText() {
        return { value: false };
      },
      async scrollToBottom() {
        return { value: true };
      },
      async navigate(url) {
        currentUrl = url;
        return { value: true };
      },
      async content() {
        return { value: `<main data-url="${currentUrl}"></main>` };
      },
      async currentUrl() {
        return { value: currentUrl };
      },
      async wait() {},
    };

    const result = await new GenericLinkCollector().collectLinks(
      {
        ...input("<main></main>"),
        source: "rendered",
        renderMode: "always",
        evaluator,
      },
      {
        ...baseSpec,
        pagination: {
          method: "next-url",
          selector: 'a[rel="next"]',
        },
      },
    );

    expect(result.stoppedBecause).toBe("complete");
    expect(result.links.map((link) => link.url)).toEqual([
      "https://example.com/posts/one",
      "https://example.com/posts/two",
      "https://example.com/posts/three",
      "https://example.com/posts/four",
    ]);
  });
});
