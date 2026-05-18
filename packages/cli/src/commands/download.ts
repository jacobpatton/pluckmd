import type { PageAnalysisInput } from "@harvest/shared";
import type { RenderMode } from "@harvest/shared";
import { ExtensionFetcher } from "../core/extension-fetcher.js";
import { resolveGenericAdapterSpec } from "../core/generic-resolver.js";
import { GenericLinkCollector } from "../core/link-collector.js";
import { RenderingPageAcquirer } from "../core/page-acquirer.js";
import { ReadabilityArticleExtractor } from "../core/heuristic-analyzer.js";
import { convertHtmlToMarkdown } from "../pipeline/converter.js";
import { writeArticle } from "../pipeline/writer.js";
import pLimit from "p-limit";

export interface DownloadCommandOptions {
  output: string;
  concurrency: number;
  delay: number;
  limit: number;
  paginationTimeoutMs: number;
  noLlm?: boolean;
  render?: RenderMode;
  refreshAdapter?: boolean;
  activeTab?: boolean;
}

function reportResult(result: { succeeded: number; failed: number; errors: Array<{ url: string; error: string }> }): void {
  console.log(`\n📊 Result: ${result.succeeded} saved, ${result.failed} failed`);

  if (result.errors.length > 0) {
    console.log("\nFailed articles:");
    for (const entry of result.errors) {
      console.log(`  - ${entry.url}: ${entry.error}`);
    }
    process.exitCode = 1;
  }
}

export async function downloadCommand(
  url: string | undefined,
  options: DownloadCommandOptions,
): Promise<void> {
  if (options.activeTab) {
    const result = await genericDownloadFromActiveTab(options);
    reportResult(result);
    return;
  }
  if (!url) throw new Error("URL is required unless --active-tab is set");

  const result = await genericDownload(url, options);
  reportResult(result);
}

async function genericDownloadFromActiveTab(
  options: DownloadCommandOptions,
): Promise<{ succeeded: number; failed: number; errors: Array<{ url: string; error: string }> }> {
  const extensionFetcher = new ExtensionFetcher();
  try {
    console.log("🔍 Adapter: generic active tab\n");
    const listing = await extensionFetcher.acquireActiveTab();
    console.log(`   Active tab: ${listing.finalUrl}`);
    return await genericDownloadWithListing(listing.finalUrl, options, listing, async (articleUrl) => {
      const page = await extensionFetcher.fetch(articleUrl);
      return {
        requestedUrl: articleUrl,
        finalUrl: page.finalUrl,
        status: page.status,
        html: page.html,
        source: "rendered",
        renderMode: "always",
      };
    });
  } finally {
    await extensionFetcher.close();
  }
}

async function genericDownload(
  url: string,
  options: DownloadCommandOptions,
): Promise<{ succeeded: number; failed: number; errors: Array<{ url: string; error: string }> }> {
  const acquirer = new RenderingPageAcquirer({ render: options.render ?? "auto" });
  try {
    console.log("🔍 Adapter: generic\n");
    const listing = await acquirer.acquire(url);
    return await genericDownloadWithListing(url, options, listing, (articleUrl) => acquirer.acquire(articleUrl));
  } finally {
    await acquirer.close();
  }
}

async function genericDownloadWithListing(
  url: string,
  options: DownloadCommandOptions,
  listing: PageAnalysisInput,
  acquireArticle: (url: string) => Promise<PageAnalysisInput>,
): Promise<{ succeeded: number; failed: number; errors: Array<{ url: string; error: string }> }> {
  const extractor = new ReadabilityArticleExtractor();
  const concurrencyLimit = pLimit(options.concurrency);
  const result = {
    succeeded: 0,
    failed: 0,
    errors: [] as Array<{ url: string; error: string }>,
  };

  const resolved = await resolveGenericAdapterSpec(listing, {
    noLlm: options.noLlm,
    refreshAdapter: options.refreshAdapter,
  });
  console.log(`   Source: ${resolved.source}`);
  console.log(`   Links: ${resolved.validation.uniqueUrlCount}`);
  console.log(`   Pagination: ${resolved.spec.pagination.method}\n`);

  const collected = await new GenericLinkCollector({
    maxElapsedMs: options.paginationTimeoutMs,
  }).collectLinks(
    listing,
    resolved.spec,
    options.limit,
  );
  console.log(`📋 ${collected.links.length} articles to download (stopped: ${collected.stoppedBecause})\n`);

  const tasks = collected.links.map((articleRef, index) =>
    concurrencyLimit(async () => {
      try {
        if (options.delay > 0 && index > 0) {
          await sleep(options.delay);
        }
        const page = await acquireArticle(articleRef.url);
        const parsed = await extractor.extractArticle({
          url: articleRef.url,
          finalUrl: page.finalUrl,
          html: page.html,
          metadataHints: { title: articleRef.titleHint },
        }, resolved.spec);
        const { markdown } = convertHtmlToMarkdown(parsed.bodyHtml, articleRef.url);
        await writeArticle(options.output, parsed.metadata, markdown);
        result.succeeded++;
        console.log(`  ✅ [${result.succeeded + result.failed}/${collected.links.length}] ${articleRef.titleHint ?? articleRef.url}`);
      } catch (downloadError) {
        result.failed++;
        const message = downloadError instanceof Error ? downloadError.message : String(downloadError);
        result.errors.push({ url: articleRef.url, error: message });
        console.log(`  ❌ [${result.succeeded + result.failed}/${collected.links.length}] ${articleRef.url}: ${message}`);
      }
    }),
  );

  await Promise.all(tasks);
  return result;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
