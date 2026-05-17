import { describe, expect, it } from "vitest";
import { HeuristicListingAnalyzer, ReadabilityArticleExtractor } from "../src/core/heuristic-analyzer.js";

const baseInput = {
  requestedUrl: "https://example.com/blog",
  finalUrl: "https://example.com/blog",
  status: 200,
  source: "static" as const,
  renderMode: "never" as const,
};

describe("HeuristicListingAnalyzer", () => {
  it("detects repeated article links and structural pagination", async () => {
    const html = `
      <main>
        <article><a href="/posts/hello-world"><h2>Hello</h2></a></article>
        <article><a href="/posts/second-post"><h2>Second</h2></a></article>
        <article><a href="/posts/third-post"><h2>Third</h2></a></article>
        <button>Load more</button>
      </main>
    `;

    const result = await new HeuristicListingAnalyzer().analyze({
      ...baseInput,
      html,
    });

    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.spec.listing.articleLinkSelector).toBe('a[href*="/posts/"]');
    expect(result.spec.listing.articleLinkHrefPattern).toBe("/posts/[^/]+/?$");
    expect(result.spec.pagination.method).toBe("auto");
    expect(result.candidates.articleLinks).toHaveLength(1);
    expect(result.candidates.pagination.length).toBeGreaterThanOrEqual(1);
  });

  it("excludes navigation and sidebar links before clustering", async () => {
    const html = `
      <nav>
        <a href="/tags/typescript">TypeScript</a>
        <a href="/tags/javascript">JavaScript</a>
        <a href="/tags/css">CSS</a>
      </nav>
      <aside>
        <a href="/related/one">Related one</a>
        <a href="/related/two">Related two</a>
        <a href="/related/three">Related three</a>
      </aside>
      <main>
        <section>
          <a href="/articles/first-story">First story</a>
          <a href="/articles/second-story">Second story</a>
          <a href="/articles/third-story">Third story</a>
          <a href="/articles/fourth-story">Fourth story</a>
        </section>
      </main>
    `;

    const result = await new HeuristicListingAnalyzer().analyze({
      ...baseInput,
      html,
    });

    expect(result.spec.listing.articleLinkSelector).toBe('a[href*="/articles/"]');
    expect(result.candidates.articleLinks[0]?.count).toBe(4);
  });
});

describe("ReadabilityArticleExtractor", () => {
  it("extracts article content and basic metadata", async () => {
    const articleHtml = `
      <html>
        <head><title>Fallback title</title></head>
        <body>
          <article>
            <h1>Article title</h1>
            <time datetime="2026-05-17T00:00:00.000Z">May 17, 2026</time>
            <p>This is a sufficiently long article body with enough content for extraction.</p>
          </article>
        </body>
      </html>
    `;

    const listing = await new HeuristicListingAnalyzer().analyze({
      ...baseInput,
      html: `
        <main>
          <a href="/posts/one">One</a>
          <a href="/posts/two">Two</a>
          <a href="/posts/three">Three</a>
        </main>
      `,
    });

    const parsed = await new ReadabilityArticleExtractor().extractArticle(
      {
        url: "https://example.com/posts/one",
        finalUrl: "https://example.com/posts/one",
        html: articleHtml,
      },
      listing.spec,
    );

    expect(parsed.metadata.title).toBe("Article title");
    expect(parsed.metadata.publishedAt).toBe("2026-05-17");
    expect(parsed.bodyHtml).toContain("sufficiently long article body");
  });
});
