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
    const maxElapsedMs = options.maxElapsedMs ?? 5 * 60 * 1000;
    const startedAt = Date.now();
    let staleCount = 0;
    let previousCount = 0;

    while (staleCount < maxStale) {
      if (Date.now() - startedAt > maxElapsedMs) {
        console.log(`   ⏱️  Scroll stopped after ${maxElapsedMs}ms timeout`);
        break;
      }

      const currentCount = await page.evaluate(
        `document.querySelectorAll('${options.linkSelector}').length`
      ) as number;

      if (currentCount === previousCount) {
        staleCount++;
      } else {
        staleCount = 0;
      }
      previousCount = currentCount;

      if (options.loadMoreSelector) {
        await this.clickExplicitPaginationSelector(page, options.loadMoreSelector);
      }

      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await page.waitForTimeout(delayMs);
    }

    console.log(`   📜 Scroll complete: ${previousCount} links found`);
    return page.content();
  }

  private async clickExplicitPaginationSelector(page: BrowserPage, selector: string): Promise<void> {
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

    // Generic dynamic pagination is handled by GenericLinkCollector. This
    // legacy path only honors explicit adapter selectors.
  }

  async close(): Promise<void> {
    if (this.browserContext) {
      await this.browserContext.close();
      this.browserContext = null;
    }
  }
}
