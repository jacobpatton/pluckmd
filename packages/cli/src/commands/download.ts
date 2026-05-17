import type { Fetcher } from "@harvest/shared";
import type { RenderMode } from "@harvest/shared";
import { FallbackFetcher } from "../core/fallback-fetcher.js";
import { ProfileFetcher } from "../core/profile-fetcher.js";
import { ExtensionFetcher } from "../core/extension-fetcher.js";
import { resolveAdapter } from "../core/adapter-registry.js";
import { orchestrate } from "../core/orchestrator.js";
import { resolveGenericAdapterSpec } from "../core/generic-resolver.js";
import { GenericLinkCollector } from "../core/link-collector.js";
import { RenderingPageAcquirer } from "../core/page-acquirer.js";
import { ReadabilityArticleExtractor } from "../core/heuristic-analyzer.js";
import { convertHtmlToMarkdown } from "../pipeline/converter.js";
import { writeArticle } from "../pipeline/writer.js";
import pLimit from "p-limit";

export type AuthMode = "auto" | "extension" | "profile";

export interface DownloadCommandOptions {
  output: string;
  auth: AuthMode;
  concurrency: number;
  delay: number;
  limit: number;
  paginationTimeoutMs: number;
  noLlm?: boolean;
  render?: RenderMode;
  refreshAdapter?: boolean;
}

async function createFetcher(authMode: AuthMode): Promise<Fetcher> {
  switch (authMode) {
    case "extension": {
      const extensionFetcher = new ExtensionFetcher();
      await extensionFetcher.connect();
      console.log("🔌 Extension mode (browser session)");
      return extensionFetcher;
    }
    case "profile": {
      const profileFetcher = new ProfileFetcher();
      await profileFetcher.init();
      console.log("⚙️  Profile mode (Playwright)");
      return profileFetcher;
    }
    case "auto": {
      const fallbackFetcher = new FallbackFetcher();
      await fallbackFetcher.init();
      return fallbackFetcher;
    }
  }
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
  url: string,
  options: DownloadCommandOptions,
): Promise<void> {
  let adapter;
  try {
    adapter = resolveAdapter(url);
  } catch (error) {
    if (!isMissingAdapterError(error)) throw error;
    const result = await genericDownload(url, options);
    reportResult(result);
    return;
  }

  const fetcher = await createFetcher(options.auth);
  try {
    console.log(`🔍 Adapter: ${adapter.id}\n`);
    const result = await orchestrate(url, fetcher, adapter, {
      outputDir: options.output,
      concurrency: options.concurrency,
      delayMs: options.delay,
      limit: options.limit,
      paginationTimeoutMs: options.paginationTimeoutMs,
    });
    reportResult(result);
  } finally {
    await fetcher.close();
  }
}

async function genericDownload(
  url: string,
  options: DownloadCommandOptions,
): Promise<{ succeeded: number; failed: number; errors: Array<{ url: string; error: string }> }> {
  const acquirer = new RenderingPageAcquirer({ render: options.render ?? "auto" });
  const extractor = new ReadabilityArticleExtractor();
  const concurrencyLimit = pLimit(options.concurrency);
  const result = {
    succeeded: 0,
    failed: 0,
    errors: [] as Array<{ url: string; error: string }>,
  };

  try {
    console.log("🔍 Adapter: generic\n");
    const listing = await acquirer.acquire(url);
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
          const page = await acquirer.acquire(articleRef.url);
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
  } finally {
    await acquirer.close();
  }
}

function isMissingAdapterError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("No adapter found");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
