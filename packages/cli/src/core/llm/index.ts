import type {
  AdapterSpec,
  AdapterValidationResult,
  ListingHeuristicCandidates,
  PageAnalysisInput,
} from "@pluckmd/shared";
import { validateAdapterSpec } from "../adapter-validator.js";
import { buildLlmRetryPrompt, buildLlmUserPrompt, SYSTEM_PROMPT } from "./prompt.js";
import { parseAdapterSpec } from "./schema.js";
import { buildStructuralDomSnapshot } from "./snapshot.js";

const DEFAULT_MAX_RETRIES = 2;

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface LlmResolverOptions {
  maxRetries?: number;
  fetchFn?: typeof fetch;
}

export interface LlmResolveResult {
  spec: AdapterSpec;
  validation: AdapterValidationResult;
  attempts: number;
  explanation: readonly string[];
}

export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const apiKey = env.PLUCKMD_LLM_API_KEY;
  const baseUrl = env.PLUCKMD_LLM_BASE_URL;
  const model = env.PLUCKMD_LLM_MODEL;

  if (!apiKey || !baseUrl || !model) return null;
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
    model,
  };
}

export function getMissingLlmConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing: string[] = [];
  if (!env.PLUCKMD_LLM_API_KEY) missing.push("PLUCKMD_LLM_API_KEY");
  if (!env.PLUCKMD_LLM_BASE_URL) missing.push("PLUCKMD_LLM_BASE_URL");
  if (!env.PLUCKMD_LLM_MODEL) missing.push("PLUCKMD_LLM_MODEL");
  return missing;
}

export async function resolveAdapterSpecWithLlm(
  input: PageAnalysisInput,
  candidates: ListingHeuristicCandidates,
  config: LlmConfig,
  options: LlmResolverOptions = {},
): Promise<LlmResolveResult> {
  const snapshot = buildStructuralDomSnapshot(input.html, input.finalUrl);
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const fetchFn = options.fetchFn ?? fetch;
  const explanation: string[] = [
    `Structural snapshot lines: ${snapshot.split("\n").filter(Boolean).length}`,
    `Candidates: ${candidates.articleLinks.length} link groups, ${candidates.pagination.length} pagination signals`,
  ];

  let previousResponse = "";
  let lastError = "";
  let lastValidation: AdapterValidationResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = attempt === 0
      ? buildLlmUserPrompt(input, snapshot, candidates)
      : buildLlmRetryPrompt(
          input,
          snapshot,
          candidates,
          previousResponse,
          lastError,
          lastValidation,
        );

    explanation.push(`LLM attempt ${attempt + 1}`);
    const response = await callOpenAiCompatible(config, prompt, fetchFn);
    previousResponse = response;

    const json = extractJson(response);
    if (!json.ok) {
      lastError = json.error;
      explanation.push(`  Parse failed: ${lastError}`);
      continue;
    }

    const parsed = parseAdapterSpec(json.value);
    if (!parsed.spec) {
      lastError = parsed.error || "AdapterSpec schema validation failed";
      explanation.push(`  Schema failed: ${lastError}`);
      continue;
    }

    const validation = await validateAdapterSpec(parsed.spec, input);
    lastValidation = validation;
    if (!validation.valid) {
      lastError = validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
      explanation.push(`  DOM validation failed: ${lastError}`);
      continue;
    }

    explanation.push(`  Success: ${validation.uniqueUrlCount} matching article URLs`);
    return {
      spec: parsed.spec,
      validation,
      attempts: attempt + 1,
      explanation,
    };
  }

  throw new Error(
    `LLM failed to produce a valid AdapterSpec after ${maxRetries + 1} attempts. Last error: ${lastError}`,
  );
}

async function callOpenAiCompatible(
  config: LlmConfig,
  userPrompt: string,
  fetchFn: typeof fetch,
): Promise<string> {
  const response = await fetchFn(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`LLM API error: ${response.status} ${response.statusText}. ${body.slice(0, 300)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned an empty response");
  return content;
}

type JsonExtraction =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function extractJson(text: string): JsonExtraction {
  const trimmed = text.trim();
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (!fenced?.[1]) {
      return { ok: false, error: "response was not valid JSON" };
    }
    try {
      return { ok: true, value: JSON.parse(fenced[1]) };
    } catch (error) {
      return { ok: false, error: `response JSON fence could not be parsed: ${(error as Error).message}` };
    }
  }
}
