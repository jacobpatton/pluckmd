import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AdapterSpec, AdapterValidationResult, PageAnalysisInput } from "@harvest/shared";
import { AdapterCache, normalizeCacheKey } from "../src/core/adapter-cache.js";

let directory: string;

const validHtml = `
  <main>
    <a href="/posts/one">One</a>
    <a href="/posts/two">Two</a>
    <a href="/posts/three">Three</a>
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

const spec: AdapterSpec = {
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

const validValidation: AdapterValidationResult = {
  valid: true,
  issues: [],
  linkCount: 3,
  uniqueUrlCount: 3,
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "harvest-cache-test-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("normalizeCacheKey", () => {
  it("normalizes domains and dynamic path segments deterministically", () => {
    expect(normalizeCacheKey("https://www.example.com/alice")).toBe("example.com__user");
    expect(normalizeCacheKey("https://example.com/posts/12345")).toBe("example.com__posts___");
    expect(normalizeCacheKey("https://example.com/blog/archive")).toBe("example.com__blog__archive");
  });
});

describe("AdapterCache", () => {
  it("saves validated specs and reloads cache hits", async () => {
    const cache = new AdapterCache({ directory });
    await cache.saveValidated(input.finalUrl, spec, validValidation, "0.1.0");

    const loaded = await cache.load(input.finalUrl, input);

    expect(loaded.reason).toBe("hit");
    expect(loaded.cached?.spec.listing.articleLinkSelector).toBe('a[href*="/posts/"]');
    expect(loaded.validation?.valid).toBe(true);

    const raw = JSON.parse(await readFile(cache.pathForUrl(input.finalUrl), "utf-8")) as {
      hitCount: number;
    };
    expect(raw.hitCount).toBe(1);
  });

  it("bypasses cache when refreshAdapter is requested", async () => {
    const cache = new AdapterCache({ directory });
    await cache.saveValidated(input.finalUrl, spec, validValidation, "0.1.0");

    const loaded = await cache.load(input.finalUrl, input, true);

    expect(loaded.reason).toBe("miss");
    expect(loaded.message).toBe("cache bypassed");
  });

  it("ignores corrupt JSON files", async () => {
    const cache = new AdapterCache({ directory });
    await writeFile(cache.pathForUrl(input.finalUrl), "{not-json", "utf-8");

    const loaded = await cache.load(input.finalUrl, input);

    expect(loaded.reason).toBe("corrupt");
    expect(loaded.cached).toBeNull();
  });

  it("ignores schema-invalid cache files", async () => {
    const cache = new AdapterCache({ directory });
    await writeFile(cache.pathForUrl(input.finalUrl), JSON.stringify({ cacheKey: "x" }), "utf-8");

    const loaded = await cache.load(input.finalUrl, input);

    expect(loaded.reason).toBe("invalid");
    expect(loaded.cached).toBeNull();
  });

  it("treats old cache entries as stale", async () => {
    const cache = new AdapterCache({
      directory,
      now: () => new Date("2026-05-17T00:00:00.000Z"),
    });
    await cache.saveValidated(input.finalUrl, spec, validValidation, "0.1.0");

    const staleCache = new AdapterCache({
      directory,
      now: () => new Date("2026-07-01T00:00:00.000Z"),
    });
    const loaded = await staleCache.load(input.finalUrl, input);

    expect(loaded.reason).toBe("stale");
  });

  it("does not save unvalidated specs", async () => {
    const cache = new AdapterCache({ directory });

    await expect(cache.saveValidated(input.finalUrl, spec, {
      valid: false,
      issues: [{ severity: "error", code: "x", message: "bad" }],
      linkCount: 0,
      uniqueUrlCount: 0,
    }, "0.1.0")).rejects.toThrow("Refusing to cache");
  });

  it("marks entries stale after repeated zero-result failures", async () => {
    const cache = new AdapterCache({ directory, staleZeroResults: 2 });
    await cache.saveValidated(input.finalUrl, spec, validValidation, "0.1.0");

    await cache.recordZeroResult(input.finalUrl);
    let raw = JSON.parse(await readFile(cache.pathForUrl(input.finalUrl), "utf-8")) as {
      zeroResultCount: number;
      validationStatus: string;
    };
    expect(raw.zeroResultCount).toBe(1);
    expect(raw.validationStatus).toBe("verified");

    await cache.recordZeroResult(input.finalUrl);
    raw = JSON.parse(await readFile(cache.pathForUrl(input.finalUrl), "utf-8")) as {
      zeroResultCount: number;
      validationStatus: string;
    };
    expect(raw.zeroResultCount).toBe(2);
    expect(raw.validationStatus).toBe("stale");
  });
});
