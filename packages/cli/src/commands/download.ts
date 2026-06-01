import type {
  AdapterSpec,
  ArticleRef,
  PageAnalysisInput,
  RenderMode,
} from "@pluckmd/shared";
import {
  ConsoleDownloadReporter,
  type DownloadReporter,
} from "./download-reporter.js";
import {
  type ArticleDownloadOutcome,
  type DownloadResult,
  summarizeDownload,
} from "./download-result.js";
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

type ArticleAcquirer = (url: string) => Promise<PageAnalysisInput>;

interface DownloadSource {
  readonly label: string;
  readonly listingDescription?: string;
  acquireListing(): Promise<PageAnalysisInput>;
  acquireArticle: ArticleAcquirer;
  close(): Promise<void>;
}

export async function downloadCommand(
  url: string | undefined,
  options: DownloadCommandOptions,
): Promise<void> {
  const source = createDownloadSource(url, options);
  const reporter = new ConsoleDownloadReporter();

  try {
    const result = await runGenericDownload(source, options, reporter);
    reporter.finished(result);
  } finally {
    await source.close();
  }
}

function createDownloadSource(
  url: string | undefined,
  options: DownloadCommandOptions,
): DownloadSource {
  if (options.activeTab) {
    const extensionFetcher = new ExtensionFetcher();
    return {
      label: "generic active tab",
      listingDescription: "Active tab",
      acquireListing: () => extensionFetcher.acquireActiveTab(),
      acquireArticle: (articleUrl) => acquireArticleThroughExtension(extensionFetcher, articleUrl),
      close: () => extensionFetcher.close(),
    };
  }

  if (!url) throw new Error("URL is required unless --active-tab is set");

  const acquirer = new RenderingPageAcquirer({ render: options.render ?? "auto" });
  return {
    label: "generic",
    acquireListing: () => acquirer.acquire(url),
    acquireArticle: (articleUrl) => acquirer.acquire(articleUrl),
    close: () => acquirer.close(),
  };
}

async function runGenericDownload(
  source: DownloadSource,
  options: DownloadCommandOptions,
  reporter: DownloadReporter,
): Promise<DownloadResult> {
  const extractor = new ReadabilityArticleExtractor();
  const concurrencyLimit = pLimit(options.concurrency);
  reporter.sourceSelected(source.label);
  const listing = await source.acquireListing();
  reporter.listingAcquired(source.listingDescription, listing);

  const resolved = await resolveGenericAdapterSpec(listing, {
    noLlm: options.noLlm,
    refreshAdapter: options.refreshAdapter,
  });
  reporter.adapterResolved(resolved);

  const collected = await new GenericLinkCollector({
    maxElapsedMs: options.paginationTimeoutMs,
  }).collectLinks(
    listing,
    resolved.spec,
    options.limit,
  );
  reporter.articlesCollected(collected.links.length, collected.stoppedBecause);

  const tasks = collected.links.map((articleRef, index) =>
    concurrencyLimit(() => downloadArticleSafely({
      articleRef,
      index,
      options,
      source,
      extractor,
      adapterSpec: resolved.spec,
    })),
  );

  const outcomes = await Promise.all(tasks);
  reportArticleOutcomes(outcomes, reporter);
  return summarizeDownload(outcomes);
}

async function acquireArticleThroughExtension(
  extensionFetcher: ExtensionFetcher,
  articleUrl: string,
): Promise<PageAnalysisInput> {
  const page = await extensionFetcher.fetch(articleUrl);
  return {
    requestedUrl: articleUrl,
    finalUrl: page.finalUrl,
    status: page.status,
    html: page.html,
    source: "rendered",
    renderMode: "always",
  };
}

async function downloadArticleSafely(args: {
  articleRef: ArticleRef;
  index: number;
  options: DownloadCommandOptions;
  source: DownloadSource;
  extractor: ReadabilityArticleExtractor;
  adapterSpec: AdapterSpec;
}): Promise<ArticleDownloadOutcome> {
  const {
    articleRef,
    index,
    options,
    source,
    extractor,
    adapterSpec,
  } = args;

  try {
    await downloadOneArticle(articleRef, index, options, source.acquireArticle, extractor, adapterSpec);
    return { status: "saved", articleRef };
  } catch (downloadError) {
    const message = downloadError instanceof Error ? downloadError.message : String(downloadError);
    return { status: "failed", articleRef, error: message };
  }
}

function reportArticleOutcomes(
  outcomes: readonly ArticleDownloadOutcome[],
  reporter: DownloadReporter,
): void {
  outcomes.forEach((outcome, index) => {
    const completed = index + 1;
    if (outcome.status === "saved") {
      reporter.articleSaved(completed, outcomes.length, outcome.articleRef.titleHint ?? outcome.articleRef.url);
      return;
    }
    reporter.articleFailed(completed, outcomes.length, outcome.articleRef.url, outcome.error);
  });
}

async function downloadOneArticle(
  articleRef: ArticleRef,
  index: number,
  options: DownloadCommandOptions,
  acquireArticle: ArticleAcquirer,
  extractor: ReadabilityArticleExtractor,
  adapterSpec: AdapterSpec,
): Promise<void> {
  await applyPerArticleDelay(index, options.delay);

  const page = await acquireArticle(articleRef.url);
  const parsed = await extractor.extractArticle({
    url: articleRef.url,
    finalUrl: page.finalUrl,
    html: page.html,
    metadataHints: { title: articleRef.titleHint },
  }, adapterSpec);
  const { markdown } = convertHtmlToMarkdown(parsed.bodyHtml, articleRef.url);
  await writeArticle(options.output, parsed.metadata, markdown);
}

async function applyPerArticleDelay(index: number, delayMilliseconds: number): Promise<void> {
  if (delayMilliseconds > 0 && index > 0) {
    await sleep(delayMilliseconds);
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
