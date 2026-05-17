import type { RenderMode } from "@harvest/shared";
import { AdapterCache } from "../core/adapter-cache.js";
import { resolveGenericAdapterSpec } from "../core/generic-resolver.js";
import { GenericLinkCollector } from "../core/link-collector.js";
import { RenderingPageAcquirer } from "../core/page-acquirer.js";

export interface InspectCommandOptions {
  explain?: boolean;
  noLlm?: boolean;
  render: RenderMode;
  refreshAdapter?: boolean;
}

export async function inspectCommand(
  url: string,
  options: InspectCommandOptions,
): Promise<void> {
  const acquirer = new RenderingPageAcquirer({ render: options.render });

  try {
    console.log(`Inspecting: ${url}`);
    const input = await acquirer.acquire(url);
    console.log(`Render: ${input.source} (${input.renderMode})`);
    console.log(`Final URL: ${input.finalUrl}`);
    console.log(`Status: ${input.status}`);
    console.log();

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
    console.error(`Inspect failed: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await acquirer.close();
  }
}
