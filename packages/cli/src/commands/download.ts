import type { Fetcher } from "@harvest/shared";
import { FallbackFetcher } from "../core/fallback-fetcher.js";
import { ProfileFetcher } from "../core/profile-fetcher.js";
import { ExtensionFetcher } from "../core/extension-fetcher.js";
import { resolveAdapter } from "../core/adapter-registry.js";
import { orchestrate } from "../core/orchestrator.js";

export type AuthMode = "auto" | "extension" | "profile";

export interface DownloadCommandOptions {
  output: string;
  auth: AuthMode;
  concurrency: number;
  delay: number;
  limit?: number;
}

async function createFetcher(authMode: AuthMode): Promise<Fetcher> {
  switch (authMode) {
    case "extension": {
      const extensionFetcher = new ExtensionFetcher();
      await extensionFetcher.connect();
      console.log("🔌 Extension mode (browser session)");
      return extensionFetcher;
    }
    case "profile": {
      const profileFetcher = new ProfileFetcher();
      await profileFetcher.init();
      console.log("⚙️  Profile mode (Playwright)");
      return profileFetcher;
    }
    case "auto": {
      const fallbackFetcher = new FallbackFetcher();
      await fallbackFetcher.init();
      return fallbackFetcher;
    }
  }
}

function reportResult(result: { succeeded: number; failed: number; errors: Array<{ url: string; error: string }> }): void {
  console.log(`\n📊 Result: ${result.succeeded} saved, ${result.failed} failed`);

  if (result.errors.length > 0) {
    console.log("\nFailed articles:");
    for (const entry of result.errors) {
      console.log(`  - ${entry.url}: ${entry.error}`);
    }
    process.exitCode = 1;
  }
}

export async function downloadCommand(
  url: string,
  options: DownloadCommandOptions,
): Promise<void> {
  const fetcher = await createFetcher(options.auth);
  const adapter = resolveAdapter(url);
  console.log(`🔍 Adapter: ${adapter.id}\n`);

  try {
    const result = await orchestrate(url, fetcher, adapter, {
      outputDir: options.output,
      concurrency: options.concurrency,
      delayMs: options.delay,
      limit: options.limit,
    });
    reportResult(result);
  } finally {
    await fetcher.close();
  }
}
