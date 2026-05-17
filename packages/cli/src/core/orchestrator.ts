import type { Fetcher, SiteAdapter, ArticleRef } from "@harvest/shared";
import { convertHtmlToMarkdown } from "../pipeline/converter.js";
import { writeArticle } from "../pipeline/writer.js";
import pLimit from "p-limit";

export interface DownloadOptions {
  outputDir: string;
  concurrency: number;
  delayMs: number;
  limit?: number;
  paginationTimeoutMs?: number;
  skipExisting?: boolean;
}

export interface DownloadResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: Array<{ url: string; error: string }>;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function collectArticleRefs(
  listingUrl: string,
  fetcher: Fetcher,
  adapter: SiteAdapter,
  limit?: number,
  paginationTimeoutMs?: number,
): Promise<ArticleRef[]> {
  console.log(`📡 Fetching listing page: ${listingUrl}`);

  let listingPage;
  if (adapter.requiresScroll && fetcher.fetchWithScroll) {
    console.log(`📜 Scrolling to load all articles...`);
    listingPage = await fetcher.fetchWithScroll(listingUrl, {
      linkSelector: adapter.linkSelector,
      loadMoreSelector: adapter.loadMoreSelector,
      scrollDelayMs: 2000,
      maxStaleAttempts: 3,
      maxElapsedMs: paginationTimeoutMs,
    });
  } else {
    listingPage = await fetcher.fetch(listingUrl);
    if (adapter.requiresScroll) {
      console.log(
        `   ⚠️  This site requires scrolling but the current fetcher doesn't support it.`,
      );
      console.log(
        `   Use --auth=profile for full scroll support.`,
      );
    }
  }

  let articleRefs = adapter.collectLinks(listingPage.html, listingUrl);

  if (limit) {
    articleRefs = articleRefs.slice(0, limit);
  }

  console.log(`📋 ${articleRefs.length} articles to download\n`);
  return articleRefs;
}

async function downloadArticle(
  articleRef: ArticleRef,
  fetcher: Fetcher,
  adapter: SiteAdapter,
  outputDir: string,
): Promise<void> {
  const page = await fetcher.fetch(articleRef.url);
  const parsed = adapter.parseArticle(page.html, articleRef.url);
  const { markdown } = convertHtmlToMarkdown(parsed.bodyHtml, articleRef.url);
  await writeArticle(outputDir, parsed.metadata, markdown);
}

function formatProgress(completed: number, total: number): string {
  return `[${completed}/${total}]`;
}

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function orchestrate(
  listingUrl: string,
  fetcher: Fetcher,
  adapter: SiteAdapter,
  options: DownloadOptions,
): Promise<DownloadResult> {
  const articleRefs = await collectArticleRefs(
    listingUrl,
    fetcher,
    adapter,
    options.limit,
    options.paginationTimeoutMs,
  );

  const concurrencyLimit = pLimit(options.concurrency);
  const result: DownloadResult = {
    total: articleRefs.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  const tasks = articleRefs.map((articleRef: ArticleRef, index: number) =>
    concurrencyLimit(async () => {
      try {
        if (options.delayMs > 0 && index > 0) {
          await sleep(options.delayMs);
        }

        await downloadArticle(articleRef, fetcher, adapter, options.outputDir);

        result.succeeded++;
        const progress = formatProgress(result.succeeded + result.failed, articleRefs.length);
        console.log(`  ✅ ${progress} ${articleRef.titleHint ?? articleRef.url}`);
      } catch (error) {
        result.failed++;
        const message = extractErrorMessage(error);
        result.errors.push({ url: articleRef.url, error: message });
        const progress = formatProgress(result.succeeded + result.failed, articleRefs.length);
        console.log(`  ❌ ${progress} ${articleRef.url}: ${message}`);
      }
    }),
  );

  await Promise.all(tasks);
  return result;
}
