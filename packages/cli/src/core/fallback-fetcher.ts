import type { Fetcher, FetchedPage, FetchOptions } from "@harvest/shared";
import { ProfileFetcher } from "./profile-fetcher.js";

type FetcherMode = "profile";

/**
 * Uses Profile mode for the default automatic fetch path.
 */
export class FallbackFetcher implements Fetcher {
  private activeFetcher: Fetcher | null = null;
  private activeMode: FetcherMode = "profile";

  async init(): Promise<void> {
    console.log("⚙️  Profile mode (Playwright)");
    const profileFetcher = new ProfileFetcher();
    await profileFetcher.init();
    this.activeFetcher = profileFetcher;
    this.activeMode = "profile";
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
