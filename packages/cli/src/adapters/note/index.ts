import type {
  SiteAdapter,
  ArticleRef,
  ParsedArticle,
} from "@harvest/shared";
import { JSDOM } from "jsdom";

const NOTE_HOSTNAME = "note.com";
const ARTICLE_LINK_SELECTOR = 'a[href*="/n/"]';
const ARTICLE_PATH_SEGMENT = "/n/";
const BODY_SELECTOR = ".note-common-styles__textnote-body";
const AUTHOR_SELECTOR = ".o-noteContentHeader__name, .m-profileName";
const TAG_SELECTOR = ".m-articleTagList a, .o-noteContentFooter__tag a";
const HEADING_SELECTOR = "h1, h2, h3, h4";

export class NoteAdapter implements SiteAdapter {
  readonly id = "note";
  readonly requiresScroll = true;
  readonly linkSelector = ARTICLE_LINK_SELECTOR;

  canHandle(url: URL): boolean {
    return url.hostname === NOTE_HOSTNAME;
  }

  collectLinks(html: string, baseUrl: string): ArticleRef[] {
    const dom = new JSDOM(html, { url: baseUrl });
    const document = dom.window.document;

    const links = document.querySelectorAll<HTMLAnchorElement>(this.linkSelector);
    const seenUrls = new Set<string>();
    const articleRefs: ArticleRef[] = [];

    for (const link of links) {
      const articleUrl = link.href.split("?")[0];
      if (!articleUrl.includes(ARTICLE_PATH_SEGMENT) || seenUrls.has(articleUrl)) continue;
      seenUrls.add(articleUrl);

      const titleHint = this.extractTitleHint(link);
      articleRefs.push({
        url: articleUrl,
        titleHint: titleHint || undefined,
      });
    }

    return articleRefs;
  }

  private extractTitleHint(linkElement: HTMLAnchorElement): string | null {
    const parentContainer = linkElement.closest("div, article, section");
    const heading = parentContainer?.querySelector(HEADING_SELECTOR);
    return heading?.textContent?.trim() || linkElement.textContent?.trim() || null;
  }

  parseArticle(html: string, url: string): ParsedArticle {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;

    const title =
      document.querySelector("h1")?.textContent?.trim() || "Untitled";

    const author =
      document.querySelector(AUTHOR_SELECTOR)?.textContent?.trim() || undefined;

    const publishedAt = this.extractPublishedDate(document);
    const bodyHtml = this.extractBody(document);
    const tags = this.extractTags(document);

    return {
      metadata: {
        url,
        title,
        author,
        publishedAt,
        tags: tags.length > 0 ? tags : undefined,
      },
      bodyHtml,
    };
  }

  private extractPublishedDate(document: Document): string | undefined {
    const timeElement = document.querySelector("time");
    if (!timeElement) return undefined;
    const datetime = timeElement.getAttribute("datetime") || "";
    return datetime.split("T")[0] || undefined;
  }

  private extractBody(document: Document): string {
    const bodyElement =
      document.querySelector(BODY_SELECTOR) ||
      document.querySelector("article");
    return bodyElement?.innerHTML || "";
  }

  private extractTags(document: Document): string[] {
    const tagElements = document.querySelectorAll(TAG_SELECTOR);
    return Array.from(tagElements)
      .map((element) => element.textContent?.trim())
      .filter(Boolean) as string[];
  }
}
