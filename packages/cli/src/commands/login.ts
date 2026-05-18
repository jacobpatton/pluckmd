import { getProfileDir } from "@harvest/shared";
import { mkdir } from "node:fs/promises";

export async function loginCommand(url: string): Promise<void> {
  let loginUrl: string;
  try {
    loginUrl = new URL(url).href;
  } catch {
    console.error("Login target must be a full URL, for example: harvest login https://example.com/login");
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

  console.log(`🔑 Opening login page: ${loginUrl}`);
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
