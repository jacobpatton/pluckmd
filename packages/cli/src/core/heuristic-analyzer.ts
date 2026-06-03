import type {
  AdapterSpec,
  ArticleExtractor,
  ArticleExtractionInput,
  ArticleLinkCandidate,
  ListingAnalyzer,
  ListingAnalysisResult,
  PageAnalysisInput,
  PaginationCandidate,
  ParsedArticle,
} from "@pluckmd/shared";
import { Readability } from "@mozilla/readability";
import { createDom } from "./dom.js";

const MIN_LINK_CLUSTER_SIZE = 3;
const EXCLUDE_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  '[role="navigation"]',
  '[aria-label*="navigation" i]',
  '[class*="nav" i]',
  '[class*="menu" i]',
  '[class*="sidebar" i]',
  '[class*="footer" i]',
  '[class*="recommend" i]',
  '[class*="related" i]',
  '[class*="breadcrumb" i]',
];

export class HeuristicListingAnalyzer implements ListingAnalyzer {
  async analyze(input: PageAnalysisInput): Promise<ListingAnalysisResult> {
    const dom = createDom(input.html, { url: input.finalUrl });
    const document = dom.window.document;
    removeExcludedRegions(document);

    const articleLinks = findArticleLinkCandidates(document, input.finalUrl);
    const topLink = articleLinks[0];

    if (!topLink) {
      throw new Error("No repeated article-link candidates found");
    }

    const pagination = findPaginationCandidates(document, input.finalUrl, topLink);
    const topPagination = pagination[0];
    const confidence = scoreOverall(topLink, topPagination);
    const spec = buildSpec(topLink, topPagination, confidence);
    const evidence = [
      topLink.evidence,
      topPagination?.evidence ?? "No clear pagination signal found",
      `Overall heuristic confidence: ${confidence.toFixed(2)}`,
    ];

    return {
      spec,
      confidence,
      candidates: { articleLinks, pagination },
      evidence,
    };
  }
}

export class ReadabilityArticleExtractor implements ArticleExtractor {
  async extractArticle(
    input: ArticleExtractionInput,
    spec: AdapterSpec,
  ): Promise<ParsedArticle> {
    const dom = createDom(input.html, { url: input.finalUrl || input.url });
    const document = dom.window.document;

    const metadata = {
      url: input.url,
      title: extractText(document, spec.article.metadataSelectors?.title) ||
        extractMeta(document, 'meta[property="og:title"]') ||
        extractMeta(document, 'meta[name="twitter:title"]') ||
        document.querySelector("h1")?.textContent?.trim() ||
        document.querySelector("title")?.textContent?.trim() ||
        input.metadataHints?.title ||
        "Untitled",
      author: extractText(document, spec.article.metadataSelectors?.author) ||
        input.metadataHints?.author,
      publishedAt: extractDate(document, spec.article.metadataSelectors?.publishedAt) ||
        input.metadataHints?.publishedAt,
      tags: extractTags(document, spec.article.metadataSelectors?.tags) ||
        input.metadataHints?.tags,
    };

    let bodyHtml = "";
    if (spec.article.method === "selector" && spec.article.contentSelector) {
      bodyHtml = document.querySelector(spec.article.contentSelector)?.innerHTML || "";
    }

    if (!bodyHtml) {
      const reader = new Readability(document.cloneNode(true) as Document);
      bodyHtml = reader.parse()?.content ||
        document.querySelector("article")?.innerHTML ||
        document.querySelector("main")?.innerHTML ||
        "";
    }

    if (!bodyHtml.trim()) {
      throw new Error(`Article extraction produced empty content for ${input.url}`);
    }

    return {
      metadata,
      bodyHtml,
    };
  }
}

function buildSpec(
  link: ArticleLinkCandidate,
  pagination: PaginationCandidate | undefined,
  confidence: number,
): AdapterSpec {
  return {
    listing: {
      articleLinkSelector: link.selector,
      articleLinkHrefPattern: link.hrefPattern,
      containerSelector: link.containerSelector,
      excludeSelectors: EXCLUDE_SELECTORS,
    },
    article: {
      method: "readability",
    },
    pagination: pagination
      ? {
          method: pagination.method,
          selector: pagination.selector,
          textPatterns: pagination.textPatterns,
          urlTemplate: pagination.urlTemplate,
        }
      : { method: "none" },
    waitStrategy: {
      afterNavigation: "domcontentloaded",
      afterLoadMoreMs: 1500,
      maxWaitMs: 30000,
    },
    evidence: `Heuristic spec from ${link.count} repeated links at confidence ${confidence.toFixed(2)}`,
  };
}

function removeExcludedRegions(document: Document): void {
  for (const selector of EXCLUDE_SELECTORS) {
    for (const element of document.querySelectorAll(selector)) {
      element.remove();
    }
  }
}

function findArticleLinkCandidates(document: Document, baseUrl: string): ArticleLinkCandidate[] {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .filter((link) => isVisibleEnough(link))
    .filter((link) => normalizeUrl(link, baseUrl) !== null);

  const grouped = new Map<string, HTMLAnchorElement[]>();
  for (const link of links) {
    const normalized = normalizeUrl(link, baseUrl);
    if (!normalized) continue;
    const pattern = pathPattern(normalized);
    if (!pattern) continue;
    const group = grouped.get(pattern) || [];
    group.push(link);
    grouped.set(pattern, group);
  }

  const candidates: ArticleLinkCandidate[] = [];
  for (const [pattern, group] of grouped) {
    const uniqueUrls = new Set(
      group.map((link) => normalizeUrl(link, baseUrl)?.href).filter(Boolean),
    );
    if (uniqueUrls.size < MIN_LINK_CLUSTER_SIZE) continue;

    const container = findCommonAncestor(group);
    const containerSelector = selectorForContainer(container);
    const selector = selectorForPattern(pattern);
    const score = scoreLinkCandidate(pattern, uniqueUrls.size, links.length, container);

    candidates.push({
      selector,
      hrefPattern: regexForPattern(pattern),
      count: uniqueUrls.size,
      score,
      containerSelector,
      evidence: `Found ${uniqueUrls.size} unique links matching path pattern ${pattern}`,
    });
  }

  return candidates
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, 8);
}

function findPaginationCandidates(
  document: Document,
  baseUrl: string,
  articleLink: ArticleLinkCandidate | undefined,
): PaginationCandidate[] {
  const candidates: PaginationCandidate[] = [];

  const relNext = document.querySelector<HTMLAnchorElement | HTMLLinkElement>(
    'a[rel="next"], link[rel="next"]',
  );
  if (relNext) {
    candidates.push({
      method: "next-url",
      score: 0.95,
      selector: relNext.tagName.toLowerCase() === "a" ? selectorForElement(relNext) : 'link[rel="next"]',
      evidence: 'Found rel="next" pagination signal',
    });
  }

  if (articleLink && hasStructuralPaginationControl(document, articleLink)) {
    candidates.push({
      method: "auto",
      score: 0.82,
      evidence: "Found a clickable control structurally positioned after the article list",
    });
  }

  const url = new URL(baseUrl);
  if (url.searchParams.has("page") || url.searchParams.has("p")) {
    candidates.push({
      method: "next-url",
      score: 0.65,
      urlTemplate: templateForPageUrl(url),
      evidence: "Current URL already contains a page-like query parameter",
    });
  }

  const paginationRegion = document.querySelector(
    '[class*="pagination" i], [class*="pager" i], nav[aria-label*="page" i]',
  );
  if (paginationRegion) {
    candidates.push({
      method: "next-url",
      score: 0.6,
      selector: selectorForElement(paginationRegion),
      evidence: "Found pagination-like region",
    });
  }

  if (hasInfiniteScrollSignal(document)) {
    candidates.push({
      method: "auto",
      score: 0.45,
      evidence: "Found feed-like DOM signal; pagination will be driven by DOM changes",
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 8);
}

function hasStructuralPaginationControl(document: Document, articleLink: ArticleLinkCandidate): boolean {
  const links = safeQueryAll<HTMLElement>(document, articleLink.selector)
    .filter((element) => isVisibleEnough(element));
  if (links.length < MIN_LINK_CLUSTER_SIZE) return false;

  const articleOrder = new Map<Element, number>();
  links.forEach((link, index) => articleOrder.set(link, index));

  const controls = safeQueryAll<HTMLElement>(
    document,
    "button, a, [role='button'], input[type='button'], input[type='submit']",
  )
    .filter((element) => isVisibleEnough(element))
    .filter((element) => !element.closest("nav, header, footer, aside"))
    .filter((element) => !element.closest(articleLink.selector));

  for (const control of controls) {
    const nodeApi = control.ownerDocument.defaultView?.Node;
    if (!nodeApi) continue;
    const precedingArticles = links.filter((link) =>
      Boolean(control.compareDocumentPosition(link) & nodeApi.DOCUMENT_POSITION_PRECEDING),
    ).length;
    if (precedingArticles >= Math.max(3, Math.floor(links.length * 0.5))) return true;
  }

  return articleOrder.size > 0 && controls.length > 0;
}

function normalizeUrl(link: HTMLAnchorElement, baseUrl: string): URL | null {
  const href = link.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return null;
  }

  try {
    const url = new URL(href, baseUrl);
    const base = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.hostname !== base.hostname) return null;
    url.hash = "";
    url.search = "";
    if (url.pathname === "/" || url.pathname.length < 2) return null;
    return url;
  } catch {
    return null;
  }
}

function pathPattern(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  return "/" + segments.map((segment, index) => {
    if (segments.length >= 2 && index === segments.length - 1) return "*";
    if (isLikelyDynamicSegment(segment, index, segments.length)) return "*";
    return segment;
  }).join("/");
}

function isLikelyDynamicSegment(segment: string, index: number, total: number): boolean {
  if (/^\d+$/.test(segment)) return true;
  if (/^[a-f0-9]{8,}$/i.test(segment)) return true;
  if (/^[a-f0-9-]{20,}$/i.test(segment)) return true;
  if (/^\d{4}[-/]\d{2}/.test(segment)) return true;
  if (segment.length > 24) return true;
  if (index === total - 1 && segment.length > 12) return true;
  return false;
}

function selectorForPattern(pattern: string): string {
  const staticSegments = pattern.split("/").filter((segment) => segment && segment !== "*");
  const lastStatic = staticSegments.at(-1);
  if (lastStatic) return `a[href*="/${lastStatic}/"]`;
  return "a[href]";
}

function regexForPattern(pattern: string): string {
  return "/" + pattern
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment === "*" ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/") + "/?$";
}

function scoreLinkCandidate(
  pattern: string,
  uniqueCount: number,
  totalLinks: number,
  container: Element,
): number {
  const countScore = Math.min(uniqueCount / 10, 0.45);
  const ratioScore = Math.min(uniqueCount / Math.max(totalLinks, 1), 0.3);
  const depthScore = Math.min(pattern.split("/").filter(Boolean).length / 8, 0.15);
  const containerScore = container.tagName.toLowerCase() === "main" || container.closest("main")
    ? 0.1
    : 0;
  return Math.min(countScore + ratioScore + depthScore + containerScore, 0.98);
}

function scoreOverall(
  link: ArticleLinkCandidate,
  pagination: PaginationCandidate | undefined,
): number {
  const paginationBoost = pagination ? Math.min(pagination.score * 0.15, 0.15) : 0;
  return Math.min(link.score + paginationBoost, 0.98);
}

function findCommonAncestor(elements: Element[]): Element {
  let ancestor = elements[0]!;
  for (const element of elements.slice(1)) {
    ancestor = commonAncestor(ancestor, element);
  }
  return ancestor;
}

function commonAncestor(a: Element, b: Element): Element {
  const ancestors = new Set<Element>();
  let current: Element | null = a;
  while (current) {
    ancestors.add(current);
    current = current.parentElement;
  }

  current = b;
  while (current) {
    if (ancestors.has(current)) return current;
    current = current.parentElement;
  }
  return a.ownerDocument.body;
}

function selectorForContainer(container: Element): string | undefined {
  if (container.tagName.toLowerCase() === "body") return undefined;
  return selectorForElement(container);
}

function selectorForElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (element.id) return `${tag}#${cssEscape(element.id)}`;

  const role = element.getAttribute("role");
  if (role) return `${tag}[role="${cssEscape(role)}"]`;

  const classes = Array.from(element.classList)
    .filter((className) => className.length <= 40 && !/^\d/.test(className))
    .slice(0, 2);
  if (classes.length > 0) {
    return `${tag}.${classes.map(cssEscape).join(".")}`;
  }

  return tag;
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function safeQueryAll<T extends Element = Element>(scope: ParentNode, selector: string): T[] {
  try {
    return Array.from(scope.querySelectorAll<T>(selector));
  } catch {
    return [];
  }
}

function isVisibleEnough(element: Element): boolean {
  if (element.closest("[hidden], [aria-hidden='true']")) return false;
  const text = element.textContent?.trim() || "";
  const hasMedia = Boolean(element.querySelector("img, picture, video"));
  const href = element.getAttribute("href") || "";
  // Card links often wrap absolutely positioned content and have no direct
  // text/media in serialized HTML. Keep path-like links and let clustering
  // decide whether they are meaningful article candidates.
  const hasPathLikeHref = /^https?:\/\//.test(href) || href.startsWith("/");
  return text.length > 0 || hasMedia || hasPathLikeHref;
}

function templateForPageUrl(url: URL): string {
  const pageParam = url.searchParams.has("page") ? "page" : "p";
  url.searchParams.set(pageParam, "{n}");
  return `${url.pathname}${url.search}`;
}

function hasInfiniteScrollSignal(document: Document): boolean {
  const scripts = document.querySelectorAll("script").length;
  const feedLike = document.querySelector(
    '[class*="infinite" i], [data-infinite], [class*="feed" i], [aria-busy="true"]',
  );
  return Boolean(feedLike) || scripts >= 10;
}

function extractText(document: Document, selector: string | undefined): string | undefined {
  if (!selector) return undefined;
  return document.querySelector(selector)?.textContent?.trim() || undefined;
}

function extractMeta(document: Document, selector: string): string | undefined {
  return document.querySelector(selector)?.getAttribute("content")?.trim() || undefined;
}

function extractDate(document: Document, selector: string | undefined): string | undefined {
  const selected = extractText(document, selector);
  if (selected) return selected;
  const time = document.querySelector("time");
  return time?.getAttribute("datetime")?.split("T")[0] || time?.textContent?.trim() || undefined;
}

function extractTags(document: Document, selector: string | undefined): string[] | undefined {
  if (!selector) return undefined;
  const tags = Array.from(document.querySelectorAll(selector))
    .map((element) => element.textContent?.trim())
    .filter(Boolean) as string[];
  return tags.length > 0 ? tags : undefined;
}
