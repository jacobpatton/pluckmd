import { getProfileDir } from "@harvest/shared";
import { mkdir } from "node:fs/promises";

const LOGIN_URLS: Record<string, string> = {
  note: "https://note.com/login",
  zenn: "https://zenn.dev/enter",
  qiita: "https://qiita.com/login",
  hatena: "https://www.hatena.ne.jp/login",
  medium: "https://medium.com/m/signin",
};

function getSupportedSites(): string {
  return Object.keys(LOGIN_URLS).join(", ");
}

export async function loginCommand(site: string): Promise<void> {
  const loginUrl = LOGIN_URLS[site];
  if (!loginUrl) {
    console.error(`Unknown site: ${site}. Supported: ${getSupportedSites()}`);
    process.exitCode = 1;
    return;
  }

  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    console.error(
      "Playwright is not installed. Run:\n  npm install playwright && npx playwright install chromium",
    );
    process.exitCode = 1;
    return;
  }

  const profileDir = getProfileDir();
  await mkdir(profileDir, { recursive: true });

  console.log(`🔑 Opening ${site} login page...`);
  console.log(`   Profile: ${profileDir}`);
  console.log("   Log in manually, then close the browser.\n");

  const browserContext = await playwright.chromium.launchPersistentContext(profileDir, {
    channel: "chromium",
    headless: false,
    viewport: null,
  });

  const page = await browserContext.newPage();
  await page.goto(loginUrl);

  await new Promise<void>((resolve) => {
    browserContext.on("close", () => resolve());
  });

  console.log("✅ Session saved. You can now use: harvest download <url>");
}
