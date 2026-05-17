import type { ArticleMetadata, ArticleRef, ParsedArticle } from "./adapter.js";

/**
 * Runtime-generated extraction specification.
 *
 * AdapterSpec is deliberately data-only so it can be produced by heuristics,
 * selected/refined by an LLM, validated mechanically, and persisted as JSON.
 * Site-specific selector code should not be added to this contract.
 */
export interface AdapterSpec {
  /**
   * Human-readable identifier for debugging and cache metadata. This is not a
   * source-code adapter id and must not imply site-specific branching.
   */
  readonly id?: string;

  readonly listing: ListingExtractionSpec;
  readonly article: ArticleExtractionSpec;
  readonly pagination: PaginationSpec;
  readonly waitStrategy?: WaitStrategy;

  /**
   * Short explanation of why this spec was selected. Used by inspect output and
   * cache review, not by extraction logic.
   */
  readonly evidence: string;
}

export interface ListingExtractionSpec {
  /**
   * CSS selector for article links within the listing page or scoped container.
   */
  readonly articleLinkSelector: string;

  /**
   * Regex source that article URLs must match after URL normalization.
   */
  readonly articleLinkHrefPattern: string;

  /**
   * Optional selector used to scope article-link lookup before exclusions.
   */
  readonly containerSelector?: string;

  /**
   * Optional selectors removed from consideration before collecting links.
   * Examples include nav, sidebar, footer, ads, and recommendation blocks.
   */
  readonly excludeSelectors?: readonly string[];
}

export interface ArticleExtractionSpec {
  readonly method: "readability" | "selector";
  readonly contentSelector?: string;
  readonly metadataSelectors?: ArticleMetadataSelectors;
}

export interface ArticleMetadataSelectors {
  readonly title?: string;
  readonly author?: string;
  readonly publishedAt?: string;
  readonly tags?: string;
}

export interface PaginationSpec {
  readonly method: "none" | "scroll" | "button-click" | "next-url" | "auto";
  readonly selector?: string;
  readonly textPatterns?: readonly string[];
  readonly urlTemplate?: string;
}

export interface WaitStrategy {
  readonly afterNavigation: "networkidle" | "load" | "domcontentloaded";
  readonly afterLoadMoreMs: number;
  readonly maxWaitMs: number;
}

export type RenderMode = "auto" | "never" | "always";
export type PageAnalysisSource = "static" | "rendered";

export interface DomEvaluationResult<T> {
  readonly value: T;
}

/**
 * Optional live DOM hook for validation/extraction steps that must run in the
 * same browser context that produced a rendered page.
 */
export interface DomEvaluator {
  count(selector: string): Promise<DomEvaluationResult<number>>;
  text(selector: string): Promise<DomEvaluationResult<string[]>>;
  hrefs(selector: string): Promise<DomEvaluationResult<string[]>>;
  click(selector: string): Promise<DomEvaluationResult<boolean>>;
  clickByText(patterns: readonly string[]): Promise<DomEvaluationResult<boolean>>;
  clickPaginationCandidate?(articleLinkSelector: string): Promise<DomEvaluationResult<boolean>>;
  scrollToBottom(): Promise<DomEvaluationResult<boolean>>;
  content(): Promise<DomEvaluationResult<string>>;
  currentUrl(): Promise<DomEvaluationResult<string>>;
  wait(milliseconds: number): Promise<void>;
}

/**
 * Boundary between page acquisition and analysis. Issue #3 will provide the
 * rendering-aware implementation; Issue #2 only defines the shape.
 */
export interface PageAnalysisInput {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly status: number;
  readonly html: string;
  readonly source: PageAnalysisSource;
  readonly renderMode: RenderMode;
  readonly evaluator?: DomEvaluator;
}

export interface ArticleLinkCandidate {
  readonly selector: string;
  readonly hrefPattern: string;
  readonly count: number;
  readonly score: number;
  readonly containerSelector?: string;
  readonly evidence: string;
}

export interface PaginationCandidate {
  readonly method: PaginationSpec["method"];
  readonly score: number;
  readonly selector?: string;
  readonly textPatterns?: readonly string[];
  readonly urlTemplate?: string;
  readonly evidence: string;
}

export interface ListingHeuristicCandidates {
  readonly articleLinks: readonly ArticleLinkCandidate[];
  readonly pagination: readonly PaginationCandidate[];
}

export interface ListingAnalysisResult {
  readonly spec: AdapterSpec;
  readonly confidence: number;
  readonly candidates: ListingHeuristicCandidates;
  readonly evidence: readonly string[];
}

export type AdapterValidationSeverity = "error" | "warning";

export interface AdapterValidationIssue {
  readonly severity: AdapterValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly selector?: string;
}

export interface AdapterValidationResult {
  readonly valid: boolean;
  readonly issues: readonly AdapterValidationIssue[];
  readonly linkCount: number;
  readonly uniqueUrlCount: number;
}

export type CachedAdapterValidationStatus = "verified" | "stale";

export interface CachedAdapter {
  readonly cacheKey: string;
  readonly urlPattern: string;
  readonly spec: AdapterSpec;
  readonly generatedAt: string;
  readonly harvestVersion: string;
  readonly sampleUrl: string;
  readonly hitCount: number;
  readonly zeroResultCount: number;
  readonly lastUsedAt: string;
  readonly validationStatus: CachedAdapterValidationStatus;
}

export interface LinkCollectionResult {
  readonly links: readonly ArticleRef[];
  readonly iterations: number;
  readonly stoppedBecause:
    | "complete"
    | "limit"
    | "max-iterations"
    | "max-time"
    | "duplicates"
    | "unchanged-dom";
}

export interface ArticleExtractionInput {
  readonly url: string;
  readonly html: string;
  readonly finalUrl: string;
  readonly metadataHints?: Partial<ArticleMetadata>;
}

export interface PageAcquirer {
  acquire(url: string): Promise<PageAnalysisInput>;
}

export interface ListingAnalyzer {
  analyze(input: PageAnalysisInput): Promise<ListingAnalysisResult>;
}

export interface LinkCollector {
  collectLinks(
    input: PageAnalysisInput,
    spec: AdapterSpec,
    limit?: number,
  ): Promise<LinkCollectionResult>;
}

export interface ArticleExtractor {
  extractArticle(
    input: ArticleExtractionInput,
    spec: AdapterSpec,
  ): Promise<ParsedArticle>;
}

/**
 * High-level composition boundary for the future generic path.
 *
 * The existing SiteAdapter flow can continue to run until each boundary has a
 * production implementation and can replace source-code site adapters safely.
 */
export interface GenericExtractionPipeline {
  readonly pageAcquirer: PageAcquirer;
  readonly listingAnalyzer: ListingAnalyzer;
  readonly linkCollector: LinkCollector;
  readonly articleExtractor: ArticleExtractor;
}
