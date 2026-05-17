import type {
  AdapterSpec,
  ArticleRef,
  DomEvaluator,
  LinkCollectionResult,
  LinkCollector,
  PageAnalysisInput,
} from "@harvest/shared";
import { createDom } from "./dom.js";

const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_MAX_ELAPSED_MS = 5 * 60 * 1000;
const DEFAULT_DUPLICATE_STALE_LIMIT = 2;
const DEFAULT_UNCHANGED_DOM_LIMIT = 2;
const DEFAULT_WAIT_AFTER_LOAD_MS = 1500;

export interface GenericLinkCollectorOptions {
  maxIterations?: number;
  maxElapsedMs?: number;
  duplicateStaleLimit?: number;
  unchangedDomLimit?: number;
  fetchPage?: (url: string) => Promise<string>;
}

interface CollectionState {
  currentHtml: string;
  currentUrl: string;
  seenUrls: Set<string>;
  links: ArticleRef[];
  iterations: number;
  duplicateStaleCount: number;
  unchangedDomCount: number;
  previousSignature: string;
}

export class GenericLinkCollector implements LinkCollector {
  private readonly maxIterations: number;
  private readonly maxElapsedMs: number;
  private readonly duplicateStaleLimit: number;
  private readonly unchangedDomLimit: number;
  private readonly fetchPage: (url: string) => Promise<string>;

  constructor(options: GenericLinkCollectorOptions = {}) {
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxElapsedMs = options.maxElapsedMs ?? DEFAULT_MAX_ELAPSED_MS;
    this.duplicateStaleLimit = options.duplicateStaleLimit ?? DEFAULT_DUPLICATE_STALE_LIMIT;
    this.unchangedDomLimit = options.unchangedDomLimit ?? DEFAULT_UNCHANGED_DOM_LIMIT;
    this.fetchPage = options.fetchPage ?? fetchHtml;
  }

  async collectLinks(
    input: PageAnalysisInput,
    spec: AdapterSpec,
    limit?: number,
  ): Promise<LinkCollectionResult> {
    const startedAt = Date.now();
    const state: CollectionState = {
      currentHtml: input.html,
      currentUrl: input.finalUrl,
      seenUrls: new Set<string>(),
      links: [],
      iterations: 0,
      duplicateStaleCount: 0,
      unchangedDomCount: 0,
      previousSignature: "",
    };

    while (state.iterations < this.maxIterations) {
      if (Date.now() - startedAt > this.maxElapsedMs) {
        return finish(state, "max-time");
      }

      state.iterations++;
      const beforeCount = state.links.length;
      const extracted = await this.extractCurrentLinks(input, spec, state);
      appendUniqueLinks(state, extracted, limit);

      if (limit && state.links.length >= limit) {
        return finish(state, "limit");
      }

      updateStaleCounters(state, beforeCount);

      if (spec.pagination.method === "none") {
        return finish(state, "complete");
      }

      if (state.duplicateStaleCount >= this.duplicateStaleLimit) {
        return finish(state, "duplicates");
      }

      if (state.unchangedDomCount >= this.unchangedDomLimit) {
        return finish(state, "unchanged-dom");
      }

      const advanced = await this.advance(input, spec, state);
      if (!advanced) {
        return finish(state, "complete");
      }
    }

    return finish(state, "max-iterations");
  }

  private async extractCurrentLinks(
    input: PageAnalysisInput,
    spec: AdapterSpec,
    state: CollectionState,
  ): Promise<ArticleRef[]> {
    if (input.evaluator) {
      const selector = scopedArticleLinkSelector(spec);
      const hrefs = (await input.evaluator.hrefs(selector)).value;
      const texts = await safeTexts(input.evaluator, selector);
      return refsFromHrefs(hrefs, texts, state.currentUrl, spec);
    }

    return extractLinksFromHtml(state.currentHtml, state.currentUrl, spec);
  }

  private async advance(
    input: PageAnalysisInput,
    spec: AdapterSpec,
    state: CollectionState,
  ): Promise<boolean> {
    switch (spec.pagination.method) {
      case "scroll":
        return this.advanceByScroll(input.evaluator, spec, state);
      case "button-click":
        return this.advanceByButton(input.evaluator, spec, state);
      case "auto":
        return this.advanceAutomatically(input.evaluator, spec, state);
      case "next-url":
        return this.advanceByNextUrl(input.evaluator, spec, state);
      case "none":
        return false;
    }
  }

  private async advanceByScroll(
    evaluator: DomEvaluator | undefined,
    spec: AdapterSpec,
    state: CollectionState,
  ): Promise<boolean> {
    if (!evaluator) return false;
    await evaluator.scrollToBottom();
    await evaluator.wait(waitAfterLoad(spec));
    await refreshRenderedState(evaluator, state);
    return true;
  }

  private async advanceByButton(
    evaluator: DomEvaluator | undefined,
    spec: AdapterSpec,
    state: CollectionState,
  ): Promise<boolean> {
    if (!evaluator) return false;

    let clicked = false;
    if (spec.pagination.textPatterns?.length) {
      clicked = (await evaluator.clickByText(spec.pagination.textPatterns)).value;
    }
    if (!clicked && spec.pagination.selector) {
      clicked = (await evaluator.click(spec.pagination.selector)).value;
    }
    if (!clicked) {
      return this.advanceByScroll(evaluator, spec, state);
    }

    await evaluator.wait(waitAfterLoad(spec));
    await evaluator.scrollToBottom();
    await evaluator.wait(waitAfterLoad(spec));
    await refreshRenderedState(evaluator, state);
    return true;
  }

  private async advanceAutomatically(
    evaluator: DomEvaluator | undefined,
    spec: AdapterSpec,
    state: CollectionState,
  ): Promise<boolean> {
    if (!evaluator) return false;

    await evaluator.scrollToBottom();
    await evaluator.wait(waitAfterLoad(spec));

    const clicked = await evaluator.clickPaginationCandidate?.(scopedArticleLinkSelector(spec));
    if (clicked?.value) {
      await evaluator.wait(waitAfterLoad(spec));
    }

    await refreshRenderedState(evaluator, state);
    return true;
  }

  private async advanceByNextUrl(
    evaluator: DomEvaluator | undefined,
    spec: AdapterSpec,
    state: CollectionState,
  ): Promise<boolean> {
    const nextUrl = evaluator
      ? await nextUrlFromRendered(evaluator, spec, state.currentUrl)
      : nextUrlFromHtml(state.currentHtml, state.currentUrl, spec);
    if (!nextUrl || nextUrl === state.currentUrl) return false;

    if (evaluator) {
      // Browser navigation support is intentionally deferred; for rendered
      // pages, next-url pagination usually has a clickable link and will be
      // handled by the browser in a later integration issue.
      return false;
    }

    state.currentHtml = await this.fetchPage(nextUrl);
    state.currentUrl = nextUrl;
    return true;
  }
}

function scopedArticleLinkSelector(spec: AdapterSpec): string {
  return spec.listing.containerSelector
    ? `${spec.listing.containerSelector} ${spec.listing.articleLinkSelector}`
    : spec.listing.articleLinkSelector;
}

function extractLinksFromHtml(
  html: string,
  baseUrl: string,
  spec: AdapterSpec,
): ArticleRef[] {
  const dom = createDom(html, { url: baseUrl });
  const document = dom.window.document;

  for (const selector of spec.listing.excludeSelectors || []) {
    for (const element of safeQueryAll(document, selector)) {
      element.remove();
    }
  }

  const scope = spec.listing.containerSelector
    ? document.querySelector(spec.listing.containerSelector) || document
    : document;
  const links = safeQueryAll<HTMLAnchorElement>(scope, spec.listing.articleLinkSelector);
  return refsFromHrefs(
    links.map((link) => link.href),
    links.map((link) => link.textContent?.trim() || undefined),
    baseUrl,
    spec,
  );
}

function refsFromHrefs(
  hrefs: readonly string[],
  titleHints: readonly (string | undefined)[],
  baseUrl: string,
  spec: AdapterSpec,
): ArticleRef[] {
  const pattern = safeRegex(spec.listing.articleLinkHrefPattern);
  const seen = new Set<string>();
  const refs: ArticleRef[] = [];

  hrefs.forEach((href, index) => {
    const normalized = normalizeUrl(href, baseUrl);
    if (!normalized || !pattern.test(normalized.pathname) || seen.has(normalized.href)) return;
    seen.add(normalized.href);
    refs.push({
      url: normalized.href,
      titleHint: titleHints[index],
    });
  });

  return refs;
}

function appendUniqueLinks(
  state: CollectionState,
  refs: readonly ArticleRef[],
  limit: number | undefined,
): void {
  for (const ref of refs) {
    if (state.seenUrls.has(ref.url)) continue;
    state.seenUrls.add(ref.url);
    state.links.push(ref);
    if (limit && state.links.length >= limit) return;
  }
}

function updateStaleCounters(state: CollectionState, beforeCount: number): void {
  if (state.links.length === beforeCount) {
    state.duplicateStaleCount++;
  } else {
    state.duplicateStaleCount = 0;
  }

  const signature = `${state.currentUrl}:${state.currentHtml.length}:${state.links.length}`;
  if (signature === state.previousSignature) {
    state.unchangedDomCount++;
  } else {
    state.unchangedDomCount = 0;
  }
  state.previousSignature = signature;
}

function finish(
  state: CollectionState,
  stoppedBecause: LinkCollectionResult["stoppedBecause"],
): LinkCollectionResult {
  return {
    links: state.links,
    iterations: state.iterations,
    stoppedBecause,
  };
}

async function safeTexts(evaluator: DomEvaluator, selector: string): Promise<string[]> {
  try {
    return (await evaluator.text(selector)).value;
  } catch {
    return [];
  }
}

async function refreshRenderedState(evaluator: DomEvaluator, state: CollectionState): Promise<void> {
  state.currentHtml = (await evaluator.content()).value;
  state.currentUrl = (await evaluator.currentUrl()).value;
}

async function nextUrlFromRendered(
  evaluator: DomEvaluator,
  spec: AdapterSpec,
  baseUrl: string,
): Promise<string | null> {
  if (spec.pagination.urlTemplate) return nextUrlFromTemplate(spec.pagination.urlTemplate, baseUrl);
  if (!spec.pagination.selector) return null;
  const hrefs = (await evaluator.hrefs(spec.pagination.selector)).value;
  return hrefs[0] ? normalizeUrl(hrefs[0], baseUrl)?.href ?? null : null;
}

function nextUrlFromHtml(html: string, baseUrl: string, spec: AdapterSpec): string | null {
  if (spec.pagination.urlTemplate) return nextUrlFromTemplate(spec.pagination.urlTemplate, baseUrl);

  const dom = createDom(html, { url: baseUrl });
  const document = dom.window.document;
  const relNext = document.querySelector<HTMLAnchorElement>('a[rel="next"]');
  if (relNext?.href) return normalizeUrl(relNext.href, baseUrl)?.href ?? null;

  if (!spec.pagination.selector) return null;
  const link = document.querySelector<HTMLAnchorElement>(spec.pagination.selector);
  return link?.href ? normalizeUrl(link.href, baseUrl)?.href ?? null : null;
}

function nextUrlFromTemplate(template: string, baseUrl: string): string | null {
  const current = new URL(baseUrl);
  const pageParam = current.searchParams.has("page") ? "page" : "p";
  const currentValue = Number(current.searchParams.get(pageParam) || "1");
  const nextPage = Number.isFinite(currentValue) ? currentValue + 1 : 2;
  const replaced = template.replace("{n}", String(nextPage));
  return new URL(replaced, baseUrl).href;
}

function waitAfterLoad(spec: AdapterSpec): number {
  return spec.waitStrategy?.afterLoadMoreMs ?? DEFAULT_WAIT_AFTER_LOAD_MS;
}

function normalizeUrl(href: string, baseUrl: string): URL | null {
  try {
    const url = new URL(href, baseUrl);
    url.hash = "";
    url.search = "";
    return url;
  } catch {
    return null;
  }
}

function safeRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch {
    return /$^/;
  }
}

function safeQueryAll<T extends Element = Element>(scope: ParentNode, selector: string): T[] {
  try {
    return Array.from(scope.querySelectorAll<T>(selector));
  } catch {
    return [];
  }
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  return response.text();
}
