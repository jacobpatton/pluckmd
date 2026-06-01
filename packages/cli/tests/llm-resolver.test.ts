import { describe, expect, it } from "vitest";
import type { ListingHeuristicCandidates, PageAnalysisInput } from "@pluckmd/shared";
import {
  getMissingLlmConfig,
  loadLlmConfig,
  resolveAdapterSpecWithLlm,
} from "../src/core/llm/index.js";

const input: PageAnalysisInput = {
  requestedUrl: "https://example.com/blog",
  finalUrl: "https://example.com/blog",
  status: 200,
  source: "static",
  renderMode: "never",
  html: `
    <main>
      <article><a href="/posts/one">One</a></article>
      <article><a href="/posts/two">Two</a></article>
      <article><a href="/posts/three">Three</a></article>
      <button>Load more</button>
    </main>
  `,
};

const candidates: ListingHeuristicCandidates = {
  articleLinks: [
    {
      selector: 'a[href*="/posts/"]',
      hrefPattern: "/posts/[^/]+/?$",
      count: 3,
      score: 0.9,
      evidence: "fixture",
    },
  ],
  pagination: [
    {
      method: "button-click",
      selector: "button",
      textPatterns: ["Load more"],
      score: 0.8,
      evidence: "fixture",
    },
  ],
};

const validSpec = {
  listing: {
    articleLinkSelector: 'a[href*="/posts/"]',
    articleLinkHrefPattern: "/posts/[^/]+/?$",
  },
  article: {
    method: "readability",
  },
  pagination: {
    method: "button-click",
    selector: "button",
    textPatterns: ["Load more"],
  },
  evidence: "selected fixture candidates",
};

function jsonResponse(content: string): Response {
  return new Response(JSON.stringify({
    choices: [
      {
        message: { content },
      },
    ],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("LLM config", () => {
  it("reports missing environment variables", () => {
    const env = {};
    expect(loadLlmConfig(env)).toBeNull();
    expect(getMissingLlmConfig(env)).toEqual([
      "PLUCKMD_LLM_API_KEY",
      "PLUCKMD_LLM_BASE_URL",
      "PLUCKMD_LLM_MODEL",
    ]);
  });

  it("loads configured OpenAI-compatible settings", () => {
    const config = loadLlmConfig({
      PLUCKMD_LLM_API_KEY: "key",
      PLUCKMD_LLM_BASE_URL: "https://llm.example/v1/",
      PLUCKMD_LLM_MODEL: "model",
    });

    expect(config).toEqual({
      apiKey: "key",
      baseUrl: "https://llm.example/v1",
      model: "model",
    });
  });
});

describe("resolveAdapterSpecWithLlm", () => {
  it("returns a valid mechanically validated AdapterSpec", async () => {
    const calls: unknown[] = [];
    const fetchFn: typeof fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return jsonResponse(JSON.stringify(validSpec));
    };

    const result = await resolveAdapterSpecWithLlm(
      input,
      candidates,
      { apiKey: "key", baseUrl: "https://llm.example/v1", model: "model" },
      { fetchFn },
    );

    expect(result.attempts).toBe(1);
    expect(result.validation.valid).toBe(true);
    expect(result.spec.listing.articleLinkSelector).toBe('a[href*="/posts/"]');
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).not.toContain("Cookie");
  });

  it("retries invalid JSON and includes correction attempt", async () => {
    const prompts: string[] = [];
    const responses = [
      jsonResponse("not-json"),
      jsonResponse(JSON.stringify(validSpec)),
    ];
    const fetchFn: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      prompts.push(body.messages.at(-1)?.content || "");
      return responses.shift()!;
    };

    const result = await resolveAdapterSpecWithLlm(
      input,
      candidates,
      { apiKey: "key", baseUrl: "https://llm.example/v1", model: "model" },
      { fetchFn },
    );

    expect(result.attempts).toBe(2);
    expect(prompts[1]).toContain("previous AdapterSpec failed validation");
    expect(prompts[1]).toContain("response was not valid JSON");
  });

  it("retries specs that fail DOM validation", async () => {
    const invalidSpec = {
      ...validSpec,
      listing: {
        articleLinkSelector: "a[href]",
        articleLinkHrefPattern: "/articles/[^/]+/?$",
      },
    };
    const responses = [
      jsonResponse(JSON.stringify(invalidSpec)),
      jsonResponse(JSON.stringify(validSpec)),
    ];
    const fetchFn: typeof fetch = async () => responses.shift()!;

    const result = await resolveAdapterSpecWithLlm(
      input,
      candidates,
      { apiKey: "key", baseUrl: "https://llm.example/v1", model: "model" },
      { fetchFn },
    );

    expect(result.attempts).toBe(2);
    expect(result.explanation.join("\n")).toContain("DOM validation failed");
  });

  it("fails clearly after retry exhaustion", async () => {
    const fetchFn: typeof fetch = async () => jsonResponse("not-json");

    await expect(resolveAdapterSpecWithLlm(
      input,
      candidates,
      { apiKey: "key", baseUrl: "https://llm.example/v1", model: "model" },
      { fetchFn, maxRetries: 1 },
    )).rejects.toThrow("LLM failed to produce a valid AdapterSpec after 2 attempts");
  });
});
