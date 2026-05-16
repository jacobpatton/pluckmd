export interface ArticleRef {
  url: string;
  titleHint?: string;
  publishedAtHint?: string;
}

export interface ArticleMetadata {
  url: string;
  title: string;
  author?: string;
  publishedAt?: string;
  tags?: string[];
}

export interface ParsedArticle {
  metadata: ArticleMetadata;
  bodyHtml: string;
}

export interface SiteAdapter {
  readonly id: string;

  canHandle(url: URL): boolean;

  /**
   * For infinite-scroll sites, the CLI handles scrolling and calls this
   * repeatedly with updated HTML until no new links appear.
   */
  collectLinks(html: string, baseUrl: string): ArticleRef[];

  requiresScroll: boolean;
  linkSelector: string;
  loadMoreSelector?: string;

  parseArticle(html: string, url: string): ParsedArticle;
}
