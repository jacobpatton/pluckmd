import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliArgs = ["--import", "tsx", "packages/cli/src/index.ts"];

interface FixtureServer {
  readonly origin: string;
  close(): Promise<void>;
}

const cleanupTasks: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanupTasks.length > 0) {
    await cleanupTasks.pop()?.();
  }
});

describe("harvest CLI fixture E2E", () => {
  it("downloads a paginated local article index as Markdown", async () => {
    const server = await startFixtureServer();
    const outputDir = await makeTempDir("harvest-output-");
    const homeDir = await makeTempDir("harvest-home-");

    const result = await runHarvest([
      "download",
      `${server.origin}/blog`,
      "--no-llm",
      "--render",
      "never",
      "--refresh-adapter",
      "--pagination-timeout",
      "10000",
      "--delay",
      "0",
      "--limit",
      "5",
      "-o",
      outputDir,
    ], homeDir);

    expect(result.stdout).toContain("5 articles to download");
    expect(result.stdout).toContain("Result: 5 saved, 0 failed");

    const files = await readdir(outputDir);
    expect(files).toHaveLength(5);

    const firstArticle = await readFile(join(outputDir, "Fixture_Article_1.md"), "utf-8");
    expect(firstArticle).toContain('title: "Fixture Article 1"');
    expect(firstArticle).toContain(`source: ${server.origin}/posts/fixture-1`);
    expect(firstArticle).toContain("This fixture article has deterministic body text number 1.");

    const fifthArticle = await readFile(join(outputDir, "Fixture_Article_5.md"), "utf-8");
    expect(fifthArticle).toContain("This fixture article has deterministic body text number 5.");
  });

  it("inspects a local fixture without LLM configuration", async () => {
    const server = await startFixtureServer();
    const homeDir = await makeTempDir("harvest-home-");

    const result = await runHarvest([
      "inspect",
      `${server.origin}/blog`,
      "--no-llm",
      "--render",
      "never",
      "--refresh-adapter",
    ], homeDir);

    expect(result.stdout).toContain("Validation: passed");
    expect(result.stdout).toContain("Article links: 3/3");
    expect(result.stdout).toContain("Pagination: next-url");
    expect(result.stdout).toContain("Link preview (5, stopped: complete)");
  });
});

async function runHarvest(args: readonly string[], homeDir: string): Promise<{ stdout: string; stderr: string }> {
  const env = {
    ...process.env,
    HOME: homeDir,
  };
  delete env.HARVEST_LLM_API_KEY;
  delete env.HARVEST_LLM_BASE_URL;
  delete env.HARVEST_LLM_MODEL;

  return execFileAsync(process.execPath, [...cliArgs, ...args], {
    cwd: process.cwd(),
    env,
  });
}

async function startFixtureServer(): Promise<FixtureServer> {
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    response.setHeader("Content-Type", "text/html; charset=utf-8");

    if (url === "/blog") {
      response.end(listingPage([1, 2, 3], "/blog/page/2"));
      return;
    }

    if (url === "/blog/page/2") {
      response.end(listingPage([4, 5]));
      return;
    }

    const match = url.match(/^\/posts\/fixture-(\d+)$/);
    if (match) {
      response.end(articlePage(Number(match[1])));
      return;
    }

    response.statusCode = 404;
    response.end("<main>not found</main>");
  });

  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not expose a TCP port");
  }

  cleanupTasks.push(() => closeServer(server));
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

function listingPage(ids: readonly number[], nextPath?: string): string {
  const links = ids
    .map((id) => `<li><a href="/posts/fixture-${id}">Fixture Article ${id}</a></li>`)
    .join("");
  const next = nextPath ? `<a rel="next" href="${nextPath}">Older articles</a>` : "";
  return `<!doctype html>
    <html>
      <head><title>Fixture Blog</title></head>
      <body>
        <main>
          <h1>Fixture Blog</h1>
          <ol class="article-list">${links}</ol>
          ${next}
        </main>
      </body>
    </html>`;
}

function articlePage(id: number): string {
  return `<!doctype html>
    <html>
      <head>
        <title>Fixture Article ${id}</title>
        <meta name="author" content="Fixture Author">
      </head>
      <body>
        <main>
          <article>
            <h1>Fixture Article ${id}</h1>
            <time datetime="2026-05-${String(id).padStart(2, "0")}">May ${id}, 2026</time>
            <p>This fixture article has deterministic body text number ${id}.</p>
            <p>It is served by an in-process HTTP server, not a real website.</p>
          </article>
        </main>
      </body>
    </html>`;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function makeTempDir(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  cleanupTasks.push(() => rm(path, { recursive: true, force: true }));
  return path;
}
