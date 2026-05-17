import type {
  AdapterSpec,
  AdapterValidationResult,
  ListingHeuristicCandidates,
  PageAnalysisInput,
} from "@harvest/shared";
import { AdapterCache } from "./adapter-cache.js";
import { validateAdapterSpec } from "./adapter-validator.js";
import { HeuristicListingAnalyzer } from "./heuristic-analyzer.js";
import {
  getMissingLlmConfig,
  loadLlmConfig,
  resolveAdapterSpecWithLlm,
} from "./llm/index.js";

const HARVEST_VERSION = "0.1.0";
const HEURISTIC_CONFIDENCE_THRESHOLD = 0.7;

export interface GenericResolveOptions {
  noLlm?: boolean;
  refreshAdapter?: boolean;
  cache?: AdapterCache;
}

export interface GenericResolveResult {
  source: "cache" | "heuristic" | "llm";
  spec: AdapterSpec;
  validation: AdapterValidationResult;
  confidence?: number;
  candidates: ListingHeuristicCandidates;
  explanation: readonly string[];
}

export class LlmConfigurationError extends Error {
  constructor(
    readonly missing: readonly string[],
    readonly candidates: ListingHeuristicCandidates,
    readonly explanation: readonly string[],
  ) {
    super(`LLM configuration required. Missing: ${missing.join(", ")}`);
    this.name = "LlmConfigurationError";
  }
}

const emptyCandidates: ListingHeuristicCandidates = {
  articleLinks: [],
  pagination: [],
};

export async function resolveGenericAdapterSpec(
  input: PageAnalysisInput,
  options: GenericResolveOptions = {},
): Promise<GenericResolveResult> {
  const explanation: string[] = [];
  const cache = options.cache ?? new AdapterCache();

  explanation.push("Stage 1: cache");
  const cacheResult = await cache.load(input.finalUrl, input, options.refreshAdapter);
  explanation.push(`  ${cacheResult.reason}${cacheResult.message ? `: ${cacheResult.message}` : ""}`);
  if (cacheResult.cached && cacheResult.validation) {
    explanation.push(`  cache key: ${cacheResult.cached.cacheKey}`);
    explanation.push(`  validation: ${cacheResult.validation.uniqueUrlCount} matching URLs`);
    return {
      source: "cache",
      spec: cacheResult.cached.spec,
      validation: cacheResult.validation,
      candidates: emptyCandidates,
      explanation,
    };
  }

  explanation.push("Stage 2: heuristics");
  let candidates = emptyCandidates;
  try {
    const heuristic = await new HeuristicListingAnalyzer().analyze(input);
    candidates = heuristic.candidates;
    const validation = await validateAdapterSpec(heuristic.spec, input);
    explanation.push(`  confidence: ${heuristic.confidence.toFixed(2)}`);
    explanation.push(`  candidates: ${candidates.articleLinks.length} link groups, ${candidates.pagination.length} pagination signals`);
    explanation.push(`  validation: ${validation.valid ? "passed" : "failed"}`);

    if (validation.valid && heuristic.confidence >= HEURISTIC_CONFIDENCE_THRESHOLD) {
      await cache.saveValidated(input.finalUrl, heuristic.spec, validation, HARVEST_VERSION);
      return {
        source: "heuristic",
        spec: heuristic.spec,
        validation,
        confidence: heuristic.confidence,
        candidates,
        explanation,
      };
    }

    if (!validation.valid) {
      explanation.push(`  validation issues: ${validation.issues.map((issue) => issue.code).join(", ")}`);
    }
  } catch (error) {
    explanation.push(`  heuristics failed: ${(error as Error).message}`);
  }

  if (options.noLlm) {
    throw new Error(
      "Heuristics could not resolve a validated adapter and --no-llm was set.",
    );
  }

  explanation.push("Stage 3: LLM");
  const config = loadLlmConfig();
  if (!config) {
    throw new LlmConfigurationError(getMissingLlmConfig(), candidates, explanation);
  }

  const llm = await resolveAdapterSpecWithLlm(input, candidates, config);
  explanation.push(...llm.explanation.map((line) => `  ${line}`));
  await cache.saveValidated(input.finalUrl, llm.spec, llm.validation, HARVEST_VERSION);

  return {
    source: "llm",
    spec: llm.spec,
    validation: llm.validation,
    candidates,
    explanation,
  };
}
