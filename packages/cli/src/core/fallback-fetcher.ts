import type { Fetcher, FetchedPage, FetchOptions } from "@harvest/shared";
import { ExtensionFetcher } from "./extension-fetcher.js";
import { ProfileFetcher } from "./profile-fetcher.js";

type FetcherMode = "extension" | "profile";

/**
 * Tries Extension first, falls back to Profile mode.
 */
export class FallbackFetcher implements Fetcher {
  private activeFetcher: Fetcher | null = null;
  private activeMode: FetcherMode = "extension";

  async init(): Promise<void> {
    const extensionFetcher = new ExtensionFetcher();
    try {
      await extensionFetcher.connect();
      this.activeFetcher = extensionFetcher;
      this.activeMode = "extension";
      console.log("🔌 Extension mode (browser session)");
    } catch {
      console.log("⚙️  Profile mode (Playwright)");
      const profileFetcher = new ProfileFetcher();
      await profileFetcher.init();
      this.activeFetcher = profileFetcher;
      this.activeMode = "profile";
    }
  }

  get mode(): FetcherMode {
    return this.activeMode;
  }

  private async getActiveFetcher(): Promise<Fetcher> {
    if (!this.activeFetcher) {
      await this.init();
    }
    if (!this.activeFetcher) {
      throw new Error("Failed to initialize any fetcher backend");
    }
    return this.activeFetcher;
  }

  async fetch(url: string, options?: FetchOptions): Promise<FetchedPage> {
    const fetcher = await this.getActiveFetcher();
    return fetcher.fetch(url, options);
  }

  async close(): Promise<void> {
    if (this.activeFetcher) {
      await this.activeFetcher.close();
      this.activeFetcher = null;
    }
  }
}
