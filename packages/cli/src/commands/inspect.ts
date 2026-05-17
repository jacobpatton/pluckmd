import type { PageAnalysisInput, RenderMode } from "@harvest/shared";
import { readFile } from "node:fs/promises";
import { AdapterCache } from "../core/adapter-cache.js";
import { writeAgentRequest } from "../core/agent-request.js";
import { validateAdapterSpec } from "../core/adapter-validator.js";
import { ExtensionFetcher } from "../core/extension-fetcher.js";
import { LlmConfigurationError, resolveGenericAdapterSpec } from "../core/generic-resolver.js";
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

export async function inspectCommand(
  url: string | undefined,
  options: InspectCommandOptions,
): Promise<void> {
  const acquirer = options.activeTab
    ? null
    : new RenderingPageAcquirer({ render: options.render });
  const extensionFetcher = options.activeTab ? new ExtensionFetcher() : null;
  let input: PageAnalysisInput | null = null;

  try {
    console.log(`Inspecting: ${options.activeTab ? "active Chrome tab" : url}`);
    if (!options.activeTab && !url) {
      throw new Error("URL is required unless --active-tab is set");
    }

    input = options.activeTab
      ? await acquireActiveTab(extensionFetcher!)
      : await acquirer!.acquire(url!);
    console.log(`Render: ${input.source} (${input.renderMode})`);
    console.log(`Final URL: ${input.finalUrl}`);
    console.log(`Status: ${input.status}`);
    console.log();

    if (options.adapterSpec) {
      await applyAdapterSpec(input, options.adapterSpec);
      return;
    }

    const result = await resolveGenericAdapterSpec(input, {
      noLlm: options.noLlm,
      refreshAdapter: options.refreshAdapter,
      cache: new AdapterCache(),
    });

    console.log(`Adapter source: ${result.source}`);
    if (typeof result.confidence === "number") {
      console.log(`Confidence: ${result.confidence.toFixed(2)}`);
    }
    console.log(`Validation: ${result.validation.valid ? "passed" : "failed"}`);
    console.log(`Article links: ${result.validation.uniqueUrlCount}/${result.validation.linkCount}`);
    console.log(`Pagination: ${result.spec.pagination.method}`);
    console.log();

    console.log("Selectors:");
    console.log(`  article links: ${result.spec.listing.articleLinkSelector}`);
    console.log(`  href pattern: ${result.spec.listing.articleLinkHrefPattern}`);
    if (result.spec.listing.containerSelector) {
      console.log(`  container: ${result.spec.listing.containerSelector}`);
    }
    if (result.spec.article.contentSelector) {
      console.log(`  content: ${result.spec.article.contentSelector}`);
    }
    if (result.spec.pagination.selector) {
      console.log(`  pagination: ${result.spec.pagination.selector}`);
    }
    console.log(`  extraction: ${result.spec.article.method}`);
    console.log();

    if (options.explain) {
      console.log("Resolution:");
      for (const line of result.explanation) {
        console.log(`  ${line}`);
      }
      if (result.validation.issues.length > 0) {
        console.log();
        console.log("Validation issues:");
        for (const issue of result.validation.issues) {
          console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
        }
      }
      console.log();
    }

    const preview = await new GenericLinkCollector({
      maxIterations: 3,
      maxElapsedMs: 15_000,
    }).collectLinks(input, result.spec, 10);
    console.log(`Link preview (${preview.links.length}, stopped: ${preview.stoppedBecause}):`);
    for (const link of preview.links) {
      console.log(`  - ${link.titleHint || link.url}`);
    }
  } catch (error) {
    if (error instanceof LlmConfigurationError) {
      const path = typeof options.agentRequest === "string" ? options.agentRequest : undefined;
      if (!input) throw error;
      const result = await writeAgentRequest(input, error.candidates, {
        outputPath: path,
        missingConfig: error.missing,
        explanation: error.explanation,
      });
      console.error(`Inspect needs adapter selection. Agent request written: ${result.path}`);
      console.error("Ask Claude Code, Codex, or another agent to create the suggested AdapterSpec JSON, then run inspect with --adapter-spec <file>.");
      process.exitCode = 1;
      return;
    }
    console.error(`Inspect failed: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await acquirer?.close();
    await extensionFetcher?.close();
  }
}

async function applyAdapterSpec(input: PageAnalysisInput, specPath: string): Promise<void> {
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
  console.log(`AdapterSpec applied: ${validation.uniqueUrlCount} matching article URLs`);
  console.log(`Cached: ${cache.pathForUrl(input.finalUrl)}`);
  console.log(`Cache key: ${cached.cacheKey}`);
}

async function acquireActiveTab(extensionFetcher: ExtensionFetcher): Promise<PageAnalysisInput> {
  return extensionFetcher.acquireActiveTab();
}
