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
