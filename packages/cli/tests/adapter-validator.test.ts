import { describe, expect, it } from "vitest";
import type { AdapterSpec, PageAnalysisInput } from "@pluckmd/shared";
import { validateAdapterSpec } from "../src/core/adapter-validator.js";

const validHtml = `
  <main>
    <article><a href="/posts/one">One</a></article>
    <article><a href="/posts/two">Two</a></article>
    <article><a href="/posts/three">Three</a></article>
    <button>Load more</button>
  </main>
`;

const input: PageAnalysisInput = {
  requestedUrl: "https://example.com/blog",
  finalUrl: "https://example.com/blog",
  status: 200,
  html: validHtml,
  source: "static",
  renderMode: "never",
};

const validSpec: AdapterSpec = {
  listing: {
    articleLinkSelector: 'a[href*="/posts/"]',
    articleLinkHrefPattern: "/posts/[^/]+/?$",
    containerSelector: "main",
    excludeSelectors: ["nav", "footer"],
  },
  article: {
    method: "readability",
  },
  pagination: {
    method: "button-click",
    selector: "button",
    textPatterns: ["Load more"],
  },
  evidence: "fixture",
};

describe("validateAdapterSpec", () => {
  it("accepts a plausible listing spec", async () => {
    const result = await validateAdapterSpec(validSpec, input);

    expect(result.valid).toBe(true);
    expect(result.linkCount).toBe(3);
    expect(result.uniqueUrlCount).toBe(3);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects broad selectors when URL pattern matches too few links", async () => {
    const result = await validateAdapterSpec(
      {
        ...validSpec,
        listing: {
          articleLinkSelector: "a[href]",
          articleLinkHrefPattern: "/articles/[^/]+/?$",
        },
      },
      {
        ...input,
        html: `
          <main>
            <a href="/posts/one">One</a>
            <a href="/posts/two">Two</a>
            <a href="/posts/three">Three</a>
            <a href="/tags/typescript">TypeScript</a>
            <a href="/about">About</a>
          </main>
        `,
      },
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("matching-url-count-too-low");
  });

  it("rejects invalid CSS selectors clearly", async () => {
    const result = await validateAdapterSpec(
      {
        ...validSpec,
        listing: {
          ...validSpec.listing,
          articleLinkSelector: "[",
        },
      },
      input,
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("invalid-article-link-selector");
  });

  it("validates selector-based content extraction plausibility", async () => {
    const result = await validateAdapterSpec(
      {
        ...validSpec,
        article: {
          method: "selector",
          contentSelector: ".empty-content",
        },
      },
      {
        ...input,
        html: `${validHtml}<article class="empty-content"></article>`,
      },
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("content-selector-not-plausible");
  });

  it("validates rendered DOM through the provided evaluator", async () => {
    const result = await validateAdapterSpec(
      validSpec,
      {
        ...input,
        source: "rendered",
        renderMode: "always",
        evaluator: {
          async count(selector) {
            if (selector === "main") return { value: 1 };
            if (selector === "button") return { value: 1 };
            return { value: 0 };
          },
          async text(selector) {
            if (selector === "button") return { value: ["Load more"] };
            return { value: [] };
          },
          async hrefs(selector) {
            expect(selector).toBe('main a[href*="/posts/"]');
            return {
              value: [
                "https://example.com/posts/one",
                "https://example.com/posts/two",
                "https://example.com/posts/three",
              ],
            };
          },
          async click() {
            return { value: true };
          },
          async clickByText() {
            return { value: true };
          },
          async scrollToBottom() {
            return { value: true };
          },
          async content() {
            return { value: validHtml };
          },
          async currentUrl() {
            return { value: "https://example.com/blog" };
          },
          async wait() {},
        },
      },
    );

    expect(result.valid).toBe(true);
    expect(result.uniqueUrlCount).toBe(3);
  });
});
