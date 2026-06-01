import type { LinkCollectionResult, PageAnalysisInput, RenderMode } from "@pluckmd/shared";
import { readFile } from "node:fs/promises";
import { ConsoleInspectReporter, type InspectReporter } from "./inspect-reporter.js";
import { AdapterCache } from "../core/adapter-cache.js";
import { writeAgentRequest } from "../core/agent-request.js";
import { validateAdapterSpec } from "../core/adapter-validator.js";
import { ExtensionFetcher } from "../core/extension-fetcher.js";
import { type GenericResolveResult, LlmConfigurationError, resolveGenericAdapterSpec } from "../core/generic-resolver.js";
import { GenericLinkCollector } from "../core/link-collector.js";
import { RenderingPageAcquirer } from "../core/page-acquirer.js";
import { parseAdapterSpec } from "../core/llm/schema.js";

export interface InspectCommandOptions {
  explain?: boolean;
  noLlm?: boolean;
  render: RenderMode;
  refreshAdapter?: boolean;
  activeTab?: boolean;
  adapterSpec?: string;
  agentRequest?: string | boolean;
}

interface InspectResources {
  acquirer: RenderingPageAcquirer | null;
  extensionFetcher: ExtensionFetcher | null;
}

export async function inspectCommand(
  url: string | undefined,
  options: InspectCommandOptions,
): Promise<void> {
  const resources = createInspectResources(options);
  const reporter = new ConsoleInspectReporter();
  let input: PageAnalysisInput | null = null;

  try {
    reporter.started(inspectTarget(url, options));

    input = await acquireInspectInput(url, options, resources);
    reporter.pageAcquired(input);

    if (options.adapterSpec) {
      await applyAdapterSpec(input, options.adapterSpec, reporter);
      return;
    }

    const result = await resolveInspectAdapter(input, options);
    reporter.resolutionReady(result, options.explain);

    const preview = await collectInspectPreview(input, result);
    reporter.linkPreviewReady(preview);
  } catch (error) {
    if (error instanceof LlmConfigurationError) {
      await handleMissingLlmConfig(error, input, options, reporter);
      process.exitCode = 1;
      return;
    }
    reporter.failed(error);
    process.exitCode = 1;
  } finally {
    await resources.acquirer?.close();
    await resources.extensionFetcher?.close();
  }
}

function inspectTarget(url: string | undefined, options: InspectCommandOptions): string {
  if (options.activeTab) return "active Chrome tab";
  if (!url) throw new Error("URL is required unless --active-tab is set");
  return url;
}

function createInspectResources(options: InspectCommandOptions): InspectResources {
  return {
    acquirer: options.activeTab ? null : new RenderingPageAcquirer({ render: options.render }),
    extensionFetcher: options.activeTab ? new ExtensionFetcher() : null,
  };
}

async function acquireInspectInput(
  url: string | undefined,
  options: InspectCommandOptions,
  resources: InspectResources,
): Promise<PageAnalysisInput> {
  if (options.activeTab) {
    if (!resources.extensionFetcher) throw new Error("Extension fetcher was not initialized");
    return resources.extensionFetcher.acquireActiveTab();
  }

  if (!url) throw new Error("URL is required unless --active-tab is set");
  if (!resources.acquirer) throw new Error("Page acquirer was not initialized");
  return resources.acquirer.acquire(url);
}

function resolveInspectAdapter(
  input: PageAnalysisInput,
  options: InspectCommandOptions,
): Promise<GenericResolveResult> {
  return resolveGenericAdapterSpec(input, {
    noLlm: options.noLlm,
    refreshAdapter: options.refreshAdapter,
    cache: new AdapterCache(),
  });
}

function collectInspectPreview(
  input: PageAnalysisInput,
  result: GenericResolveResult,
): Promise<LinkCollectionResult> {
  return new GenericLinkCollector({
    maxIterations: 3,
    maxElapsedMs: 15_000,
  }).collectLinks(input, result.spec, 10);
}

async function handleMissingLlmConfig(
  error: LlmConfigurationError,
  input: PageAnalysisInput | null,
  options: InspectCommandOptions,
  reporter: InspectReporter,
): Promise<void> {
  if (!input) throw error;

  const path = typeof options.agentRequest === "string" ? options.agentRequest : undefined;
  const result = await writeAgentRequest(input, error.candidates, {
    outputPath: path,
    missingConfig: error.missing,
    explanation: error.explanation,
  });
  reporter.agentRequestWritten(result.path);
}

async function applyAdapterSpec(
  input: PageAnalysisInput,
  specPath: string,
  reporter: InspectReporter,
): Promise<void> {
  const parsedJson = JSON.parse(await readFile(specPath, "utf-8")) as unknown;
  const parsed = parseAdapterSpec(parsedJson);
  if (!parsed.spec) {
    throw new Error(`AdapterSpec schema validation failed: ${parsed.error}`);
  }

  const validation = await validateAdapterSpec(parsed.spec, input);
  if (!validation.valid) {
    throw new Error(
      `AdapterSpec DOM validation failed: ${validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`,
    );
  }

  const cache = new AdapterCache();
  const cached = await cache.saveValidated(input.finalUrl, parsed.spec, validation, "0.1.0");
  reporter.adapterSpecApplied(validation.uniqueUrlCount, cache.pathForUrl(input.finalUrl), cached.cacheKey);
}
