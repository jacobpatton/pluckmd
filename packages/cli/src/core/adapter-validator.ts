import type {
  AdapterSpec,
  AdapterValidationIssue,
  AdapterValidationResult,
  DomEvaluator,
  PageAnalysisInput,
} from "@harvest/shared";
import { JSDOM } from "jsdom";

const LISTING_LINK_THRESHOLD = 3;
const CONTENT_TEXT_THRESHOLD = 80;

export async function validateAdapterSpec(
  spec: AdapterSpec,
  input: PageAnalysisInput,
): Promise<AdapterValidationResult> {
  const issues: AdapterValidationIssue[] = [];
  const document = createValidationDocument(spec, input, issues);

  const linkStats = input.evaluator
    ? await validateLinksWithEvaluator(spec, input.evaluator, input.finalUrl, issues)
    : validateLinksWithDocument(spec, document, input.finalUrl, issues);

  validateContainerSelector(spec, document, issues);
  validateExcludeSelectors(spec, document, issues);
  await validateContentSelector(spec, document, input.evaluator, issues);
  await validatePagination(spec, document, input.evaluator, issues);

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
    linkCount: linkStats.linkCount,
    uniqueUrlCount: linkStats.uniqueUrlCount,
  };
}

interface LinkStats {
  linkCount: number;
  uniqueUrlCount: number;
}

function createValidationDocument(
  spec: AdapterSpec,
  input: PageAnalysisInput,
  issues: AdapterValidationIssue[],
): Document {
  const dom = new JSDOM(input.html, { url: input.finalUrl });
  const document = dom.window.document;

  for (const selector of spec.listing.excludeSelectors || []) {
    try {
      for (const element of document.querySelectorAll(selector)) {
        element.remove();
      }
    } catch (error) {
      issues.push({
        severity: "error",
        code: "invalid-exclude-selector",
        selector,
        message: `exclude selector is invalid: ${(error as Error).message}`,
      });
    }
  }

  return document;
}

function validateLinksWithDocument(
  spec: AdapterSpec,
  document: Document,
  finalUrl: string,
  issues: AdapterValidationIssue[],
): LinkStats {
  let links: HTMLAnchorElement[] = [];
  try {
    const scope = getListingScope(spec, document, issues);
    links = Array.from(
      scope.querySelectorAll<HTMLAnchorElement>(spec.listing.articleLinkSelector),
    );
  } catch (error) {
    issues.push({
      severity: "error",
      code: "invalid-article-link-selector",
      selector: spec.listing.articleLinkSelector,
      message: `article link selector is invalid: ${(error as Error).message}`,
    });
    return { linkCount: 0, uniqueUrlCount: 0 };
  }

  return validateLinkUrls(spec, links.map((link) => link.href), finalUrl, issues);
}

async function validateLinksWithEvaluator(
  spec: AdapterSpec,
  evaluator: DomEvaluator,
  finalUrl: string,
  issues: AdapterValidationIssue[],
): Promise<LinkStats> {
  try {
    if (spec.listing.containerSelector) {
      const containerCount = (await evaluator.count(spec.listing.containerSelector)).value;
      if (containerCount < 1) {
        issues.push({
          severity: "error",
          code: "container-selector-empty",
          selector: spec.listing.containerSelector,
          message: "container selector matched no elements in rendered DOM",
        });
      }
    }

    const hrefs = (await evaluator.hrefs(scopedArticleLinkSelector(spec))).value;
    return validateLinkUrls(spec, hrefs, finalUrl, issues);
  } catch (error) {
    issues.push({
      severity: "error",
      code: "rendered-article-link-validation-failed",
      selector: spec.listing.articleLinkSelector,
      message: `rendered article link validation failed: ${(error as Error).message}`,
    });
    return { linkCount: 0, uniqueUrlCount: 0 };
  }
}

function scopedArticleLinkSelector(spec: AdapterSpec): string {
  return spec.listing.containerSelector
    ? `${spec.listing.containerSelector} ${spec.listing.articleLinkSelector}`
    : spec.listing.articleLinkSelector;
}

function validateLinkUrls(
  spec: AdapterSpec,
  hrefs: readonly string[],
  finalUrl: string,
  issues: AdapterValidationIssue[],
): LinkStats {
  const linkCount = hrefs.length;
  const uniqueUrls = new Set<string>();
  let matchingHrefCount = 0;
  let pattern: RegExp;

  try {
    pattern = new RegExp(spec.listing.articleLinkHrefPattern);
  } catch (error) {
    issues.push({
      severity: "error",
      code: "invalid-href-pattern",
      message: `articleLinkHrefPattern is invalid: ${(error as Error).message}`,
    });
    return { linkCount, uniqueUrlCount: 0 };
  }

  for (const href of hrefs) {
    const normalized = normalizeHref(href, finalUrl);
    if (!normalized) continue;
    if (pattern.test(normalized.pathname)) {
      matchingHrefCount++;
      uniqueUrls.add(normalized.href);
    }
  }

  if (linkCount < LISTING_LINK_THRESHOLD) {
    issues.push({
      severity: "error",
      code: "article-link-count-too-low",
      selector: spec.listing.articleLinkSelector,
      message: `article link selector matched ${linkCount} links; expected at least ${LISTING_LINK_THRESHOLD}`,
    });
  }

  if (uniqueUrls.size < LISTING_LINK_THRESHOLD) {
    issues.push({
      severity: "error",
      code: "matching-url-count-too-low",
      selector: spec.listing.articleLinkSelector,
      message: `only ${uniqueUrls.size} unique URLs matched articleLinkHrefPattern`,
    });
  }

  if (matchingHrefCount > 0 && matchingHrefCount / Math.max(linkCount, 1) < 0.5) {
    issues.push({
      severity: "error",
      code: "href-pattern-too-broad-or-mismatched",
      selector: spec.listing.articleLinkSelector,
      message: `only ${matchingHrefCount}/${linkCount} selected links matched articleLinkHrefPattern`,
    });
  }

  return { linkCount, uniqueUrlCount: uniqueUrls.size };
}

function getListingScope(
  spec: AdapterSpec,
  document: Document,
  issues: AdapterValidationIssue[],
): ParentNode {
  if (!spec.listing.containerSelector) return document;

  try {
    const container = document.querySelector(spec.listing.containerSelector);
    if (!container) {
      issues.push({
        severity: "error",
        code: "container-selector-empty",
        selector: spec.listing.containerSelector,
        message: "container selector matched no elements",
      });
      return document;
    }
    return container;
  } catch (error) {
    issues.push({
      severity: "error",
      code: "invalid-container-selector",
      selector: spec.listing.containerSelector,
      message: `container selector is invalid: ${(error as Error).message}`,
    });
    return document;
  }
}

function validateContainerSelector(
  spec: AdapterSpec,
  document: Document,
  issues: AdapterValidationIssue[],
): void {
  if (!spec.listing.containerSelector) return;

  try {
    const container = document.querySelector(spec.listing.containerSelector);
    if (!container) return;

    const textLength = container.textContent?.trim().length || 0;
    if (textLength === 0) {
      issues.push({
        severity: "error",
        code: "container-selector-empty-content",
        selector: spec.listing.containerSelector,
        message: "container selector matched an element with no text content",
      });
    }
  } catch {
    // Already reported by getListingScope.
  }
}

function validateExcludeSelectors(
  spec: AdapterSpec,
  document: Document,
  issues: AdapterValidationIssue[],
): void {
  for (const selector of spec.listing.excludeSelectors || []) {
    try {
      document.querySelector(selector);
    } catch (error) {
      issues.push({
        severity: "error",
        code: "invalid-exclude-selector",
        selector,
        message: `exclude selector is invalid: ${(error as Error).message}`,
      });
    }
  }
}

async function validateContentSelector(
  spec: AdapterSpec,
  document: Document,
  evaluator: DomEvaluator | undefined,
  issues: AdapterValidationIssue[],
): Promise<void> {
  if (spec.article.method !== "selector") return;

  if (!spec.article.contentSelector) {
    issues.push({
      severity: "error",
      code: "missing-content-selector",
      message: "contentSelector is required when article extraction method is selector",
    });
    return;
  }

  if (evaluator) {
    try {
      const texts = (await evaluator.text(spec.article.contentSelector)).value;
      const textLength = texts.join(" ").trim().length;
      if (texts.length === 0 || textLength < CONTENT_TEXT_THRESHOLD) {
        issues.push({
          severity: "error",
          code: "content-selector-not-plausible",
          selector: spec.article.contentSelector,
          message: `content selector returned ${textLength} chars in rendered DOM`,
        });
      }
      return;
    } catch (error) {
      issues.push({
        severity: "error",
        code: "invalid-content-selector",
        selector: spec.article.contentSelector,
        message: `content selector is invalid in rendered DOM: ${(error as Error).message}`,
      });
      return;
    }
  }

  try {
    const content = document.querySelector(spec.article.contentSelector);
    const textLength = content?.textContent?.trim().length || 0;
    if (!content || textLength < CONTENT_TEXT_THRESHOLD) {
      issues.push({
        severity: "error",
        code: "content-selector-not-plausible",
        selector: spec.article.contentSelector,
        message: `content selector returned ${textLength} chars`,
      });
    }
  } catch (error) {
    issues.push({
      severity: "error",
      code: "invalid-content-selector",
      selector: spec.article.contentSelector,
      message: `content selector is invalid: ${(error as Error).message}`,
    });
  }
}

async function validatePagination(
  spec: AdapterSpec,
  document: Document,
  evaluator: DomEvaluator | undefined,
  issues: AdapterValidationIssue[],
): Promise<void> {
  const pagination = spec.pagination;
  if (pagination.method === "none" || pagination.method === "scroll" || pagination.method === "auto") return;

  if (pagination.method === "next-url" && pagination.urlTemplate) return;

  if (!pagination.selector) {
    issues.push({
      severity: "error",
      code: "missing-pagination-selector",
      message: `${pagination.method} pagination requires selector or urlTemplate`,
    });
    return;
  }

  if (evaluator) {
    try {
      const count = (await evaluator.count(pagination.selector)).value;
      if (count < 1 && !await renderedTextPatternExists(evaluator, pagination.textPatterns)) {
        issues.push({
          severity: "error",
          code: "pagination-selector-empty",
          selector: pagination.selector,
          message: "pagination selector matched no elements in rendered DOM",
        });
      }
      return;
    } catch (error) {
      issues.push({
        severity: "error",
        code: "invalid-pagination-selector",
        selector: pagination.selector,
        message: `pagination selector is invalid in rendered DOM: ${(error as Error).message}`,
      });
      return;
    }
  }

  try {
    const found = document.querySelector(pagination.selector);
    if (!found && !textPatternExists(document, pagination.textPatterns)) {
      issues.push({
        severity: "error",
        code: "pagination-selector-empty",
        selector: pagination.selector,
        message: "pagination selector matched no elements",
      });
    }
  } catch (error) {
    issues.push({
      severity: "error",
      code: "invalid-pagination-selector",
      selector: pagination.selector,
      message: `pagination selector is invalid: ${(error as Error).message}`,
    });
  }
}

function normalizeHref(href: string, baseUrl: string): URL | null {
  try {
    const url = new URL(href, baseUrl);
    url.hash = "";
    url.search = "";
    return url;
  } catch {
    return null;
  }
}

function textPatternExists(document: Document, patterns: readonly string[] | undefined): boolean {
  if (!patterns?.length) return false;
  const elements = document.querySelectorAll("button, a, [role='button']");
  for (const element of elements) {
    const text = element.textContent?.trim() || "";
    if (patterns.some((pattern) => text.includes(pattern))) return true;
  }
  return false;
}

async function renderedTextPatternExists(
  evaluator: DomEvaluator,
  patterns: readonly string[] | undefined,
): Promise<boolean> {
  if (!patterns?.length) return false;
  const texts = [
    ...(await evaluator.text("button")).value,
    ...(await evaluator.text("a")).value,
    ...(await evaluator.text("[role='button']")).value,
  ];
  return texts.some((text) => patterns.some((pattern) => text.includes(pattern)));
}
