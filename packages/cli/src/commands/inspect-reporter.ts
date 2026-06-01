import type { LinkCollectionResult, PageAnalysisInput } from "@pluckmd/shared";
import type { GenericResolveResult } from "../core/generic-resolver.js";

export interface InspectReporter {
  started(target: string): void;
  pageAcquired(input: PageAnalysisInput): void;
  resolutionReady(result: GenericResolveResult, explain: boolean | undefined): void;
  linkPreviewReady(preview: LinkCollectionResult): void;
  adapterSpecApplied(matchCount: number, cachePath: string, cacheKey: string): void;
  agentRequestWritten(path: string): void;
  failed(error: unknown): void;
}

export class ConsoleInspectReporter implements InspectReporter {
  started(target: string): void {
    console.log(`Inspecting: ${target}`);
  }

  pageAcquired(input: PageAnalysisInput): void {
    console.log(`Render: ${input.source} (${input.renderMode})`);
    console.log(`Final URL: ${input.finalUrl}`);
    console.log(`Status: ${input.status}`);
    console.log();
  }

  resolutionReady(result: GenericResolveResult, explain: boolean | undefined): void {
    console.log(`Adapter source: ${result.source}`);
    if (typeof result.confidence === "number") {
      console.log(`Confidence: ${result.confidence.toFixed(2)}`);
    }
    console.log(`Validation: ${result.validation.valid ? "passed" : "failed"}`);
    console.log(`Article links: ${result.validation.uniqueUrlCount}/${result.validation.linkCount}`);
    console.log(`Pagination: ${result.spec.pagination.method}`);
    console.log();

    this.reportSelectors(result);
    if (explain) {
      this.reportExplanation(result);
    }
  }

  linkPreviewReady(preview: LinkCollectionResult): void {
    console.log(`Link preview (${preview.links.length}, stopped: ${preview.stoppedBecause}):`);
    for (const link of preview.links) {
      console.log(`  - ${link.titleHint || link.url}`);
    }
  }

  adapterSpecApplied(matchCount: number, cachePath: string, cacheKey: string): void {
    console.log(`AdapterSpec applied: ${matchCount} matching article URLs`);
    console.log(`Cached: ${cachePath}`);
    console.log(`Cache key: ${cacheKey}`);
  }

  agentRequestWritten(path: string): void {
    console.error(`Inspect needs adapter selection. Agent request written: ${path}`);
    console.error("Ask Claude Code, Codex, or another agent to create the suggested AdapterSpec JSON, then run inspect with --adapter-spec <file>.");
  }

  failed(error: unknown): void {
    console.error(`Inspect failed: ${(error as Error).message}`);
  }

  private reportSelectors(result: GenericResolveResult): void {
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
  }

  private reportExplanation(result: GenericResolveResult): void {
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
}
