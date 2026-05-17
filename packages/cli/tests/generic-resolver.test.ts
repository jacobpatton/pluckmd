import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PageAnalysisInput } from "@harvest/shared";
import { AdapterCache } from "../src/core/adapter-cache.js";
import { resolveGenericAdapterSpec } from "../src/core/generic-resolver.js";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "harvest-resolver-test-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

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

const resolvableHtml = `
  <main>
    <a href="/posts/one">One</a>
    <a href="/posts/two">Two</a>
    <a href="/posts/three">Three</a>
    <button>Load more</button>
  </main>
`;

describe("resolveGenericAdapterSpec", () => {
  it("resolves with heuristics and then reuses cache", async () => {
    const cache = new AdapterCache({ directory });
    const first = await resolveGenericAdapterSpec(input(resolvableHtml), {
      cache,
      noLlm: true,
    });

    expect(first.source).toBe("heuristic");
    expect(first.validation.valid).toBe(true);

    const second = await resolveGenericAdapterSpec(input(resolvableHtml), {
      cache,
      noLlm: true,
    });

    expect(second.source).toBe("cache");
    expect(second.validation.valid).toBe(true);
  });

  it("honors refreshAdapter by bypassing cache", async () => {
    const cache = new AdapterCache({ directory });
    await resolveGenericAdapterSpec(input(resolvableHtml), { cache, noLlm: true });

    const refreshed = await resolveGenericAdapterSpec(input(resolvableHtml), {
      cache,
      noLlm: true,
      refreshAdapter: true,
    });

    expect(refreshed.source).toBe("heuristic");
    expect(refreshed.explanation.join("\n")).toContain("cache bypassed");
  });

  it("fails clearly when heuristics cannot resolve and LLM is disabled", async () => {
    await expect(resolveGenericAdapterSpec(input("<main><p>No links</p></main>"), {
      cache: new AdapterCache({ directory }),
      noLlm: true,
    })).rejects.toThrow("--no-llm was set");
  });

  it("reports missing LLM configuration when fallback is needed", async () => {
    await expect(resolveGenericAdapterSpec(input("<main><p>No links</p></main>"), {
      cache: new AdapterCache({ directory }),
    })).rejects.toThrow("LLM configuration required");
  });
});
