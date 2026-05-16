import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

function createTurndownService(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  service.use(gfm);
  service.remove(["script", "style", "nav", "footer", "iframe"]);

  service.addRule("images", {
    filter: "img",
    replacement(_content: string, node: TurndownService.Node) {
      const element = node as HTMLImageElement;
      const src = element.getAttribute("src") || "";
      const alt = element.getAttribute("alt") || "";
      if (!src) return "";
      return `![${alt}](${src})\n\n`;
    },
  });

  return service;
}

let cachedService: TurndownService | null = null;

function getTurndownService(): TurndownService {
  if (!cachedService) {
    cachedService = createTurndownService();
  }
  return cachedService;
}

export interface ConvertResult {
  markdown: string;
  title: string;
  excerpt: string;
}

function extractTitle(document: Document): string {
  return (
    document.querySelector("h1")?.textContent?.trim() ||
    document.querySelector("title")?.textContent?.trim() ||
    "Untitled"
  );
}

function findArticleBody(document: Document): Element {
  return (
    document.querySelector("article") ||
    document.querySelector("main") ||
    document.body
  );
}

export function convertHtmlToMarkdown(
  html: string,
  url: string,
): ConvertResult {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;
  const turndown = getTurndownService();

  const reader = new Readability(document.cloneNode(true) as Document, {
    keepClasses: false,
  });
  const article = reader.parse();

  if (article?.content) {
    return {
      markdown: turndown.turndown(article.content),
      title: article.title || extractTitle(document),
      excerpt: article.excerpt || "",
    };
  }

  const body = findArticleBody(document);
  return {
    markdown: turndown.turndown(body.innerHTML),
    title: extractTitle(document),
    excerpt: "",
  };
}
