import type { Fetcher, FetchedPage, FetchOptions, ScrollOptions } from "@harvest/shared";
import { getProfileDir } from "@harvest/shared";

/**
 * Minimal interface for the subset of Playwright's BrowserContext we use.
 * Avoids importing playwright at the type level (it's an optional dependency).
 */
interface BrowserContext {
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
}

interface BrowserPage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<{ status(): number } | null>;
  content(): Promise<string>;
  url(): string;
  close(): Promise<void>;
  evaluate(fn: string | Function): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  locator(selector: string): BrowserLocator;
}

interface BrowserLocator {
  count(): Promise<number>;
  first(): BrowserLocator;
  click(options?: { timeout?: number }): Promise<void>;
}

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export class ProfileFetcher implements Fetcher {
  private browserContext: BrowserContext | null = null;

  async init(): Promise<void> {
    if (this.browserContext) return;

    let playwright: typeof import("playwright");
    try {
      playwright = await import("playwright");
    } catch {
      throw new Error(
        "Playwright is not installed. Run: npm install playwright && npx playwright install chromium",
      );
    }

    const profileDir = getProfileDir();
    this.browserContext = await playwright.chromium.launchPersistentContext(profileDir, {
      channel: "chromium",
      headless: true,
      viewport: DEFAULT_VIEWPORT,
    });
  }

  private getContext(): BrowserContext {
    if (!this.browserContext) {
      throw new Error("ProfileFetcher is not initialized. Call init() first.");
    }
    return this.browserContext;
  }

  async fetch(url: string, options?: FetchOptions): Promise<FetchedPage> {
    await this.init();

    const context = this.getContext();
    const page = await context.newPage();
    try {
      const response = await page.goto(url, {
        waitUntil: options?.waitUntil ?? "networkidle",
        timeout: options?.timeoutMs ?? 30_000,
      });

      const html = await page.content();
      return {
        html,
        finalUrl: page.url(),
        status: response?.status() ?? 200,
      };
    } finally {
      await page.close();
    }
  }

  async fetchWithScroll(url: string, scrollOptions: ScrollOptions, fetchOptions?: FetchOptions): Promise<FetchedPage> {
    await this.init();

    const context = this.getContext();
    const page = await context.newPage();
    try {
      const response = await page.goto(url, {
        waitUntil: fetchOptions?.waitUntil ?? "networkidle",
        timeout: fetchOptions?.timeoutMs ?? 30_000,
      });

      const html = await this.scrollUntilStable(page, scrollOptions);

      return {
        html,
        finalUrl: page.url(),
        status: response?.status() ?? 200,
      };
    } finally {
      await page.close();
    }
  }

  private async scrollUntilStable(page: BrowserPage, options: ScrollOptions): Promise<string> {
    const delayMs = options.scrollDelayMs ?? 2000;
    const maxStale = options.maxStaleAttempts ?? 3;
    let staleCount = 0;
    let previousCount = 0;

    while (staleCount < maxStale) {
      const currentCount = await page.evaluate(
        `document.querySelectorAll('${options.linkSelector}').length`
      ) as number;

      if (currentCount === previousCount) {
        staleCount++;
      } else {
        staleCount = 0;
      }
      previousCount = currentCount;

      // Try clicking "Load More" button if specified
      if (options.loadMoreSelector) {
        await this.clickLoadMoreIfPresent(page, options.loadMoreSelector);
      }

      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await page.waitForTimeout(delayMs);
    }

    console.log(`   📜 Scroll complete: ${previousCount} links found`);
    return page.content();
  }

  private async clickLoadMoreIfPresent(page: BrowserPage, selector: string): Promise<void> {
    // note.com uses text-based buttons; try multiple selectors
    const selectors = selector.split(", ");

    for (const sel of selectors) {
      try {
        const locator = page.locator(sel);
        const count = await locator.count();
        if (count > 0) {
          await locator.first().click({ timeout: 3000 });
          await page.waitForTimeout(1500);
          return;
        }
      } catch {
        // Button not found or not clickable — continue
      }
    }

    // Fallback: find any button/link with load-more-like text via evaluate
    const clicked = await page.evaluate(`
      (() => {
        const patterns = ['もっと見る', 'もっとみる', 'さらに表示', 'Load more', 'Show more'];
        const elements = document.querySelectorAll('button, a, div[role="button"]');
        for (const el of elements) {
          const text = (el.textContent || '').trim();
          if (patterns.some(p => text.includes(p))) {
            el.click();
            return true;
          }
        }
        return false;
      })()
    `) as boolean;

    if (clicked) {
      await page.waitForTimeout(1500);
    }
  }

  async close(): Promise<void> {
    if (this.browserContext) {
      await this.browserContext.close();
      this.browserContext = null;
    }
  }
}
