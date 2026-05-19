import type { LinkCollectionResult, PageAnalysisInput } from "@harvest/shared";
import type { DownloadResult } from "./download-result.js";
import type { GenericResolveResult } from "../core/generic-resolver.js";

export interface DownloadReporter {
  sourceSelected(label: string): void;
  listingAcquired(description: string | undefined, input: PageAnalysisInput): void;
  adapterResolved(result: GenericResolveResult): void;
  articlesCollected(total: number, stoppedBecause: LinkCollectionResult["stoppedBecause"]): void;
  articleSaved(completed: number, total: number, title: string): void;
  articleFailed(completed: number, total: number, url: string, error: string): void;
  finished(result: DownloadResult): void;
}

export class ConsoleDownloadReporter implements DownloadReporter {
  sourceSelected(label: string): void {
    console.log(`🔍 Adapter: ${label}\n`);
  }

  listingAcquired(description: string | undefined, input: PageAnalysisInput): void {
    if (description) {
      console.log(`   ${description}: ${input.finalUrl}`);
    }
  }

  adapterResolved(result: GenericResolveResult): void {
    console.log(`   Source: ${result.source}`);
    console.log(`   Links: ${result.validation.uniqueUrlCount}`);
    console.log(`   Pagination: ${result.spec.pagination.method}\n`);
  }

  articlesCollected(total: number, stoppedBecause: LinkCollectionResult["stoppedBecause"]): void {
    console.log(`📋 ${total} articles to download (stopped: ${stoppedBecause})\n`);
  }

  articleSaved(completed: number, total: number, title: string): void {
    this.reportArticleProgress("✅", completed, total, title);
  }

  articleFailed(completed: number, total: number, url: string, error: string): void {
    this.reportArticleProgress("❌", completed, total, `${url}: ${error}`);
  }

  finished(result: DownloadResult): void {
    console.log(`\n📊 Result: ${result.succeeded} saved, ${result.failed} failed`);

    if (result.errors.length > 0) {
      console.log("\nFailed articles:");
      for (const entry of result.errors) {
        console.log(`  - ${entry.url}: ${entry.error}`);
      }
      process.exitCode = 1;
    }
  }

  private reportArticleProgress(
    icon: string,
    completed: number,
    total: number,
    message: string,
  ): void {
    console.log(`  ${icon} [${completed}/${total}] ${message}`);
  }
}
