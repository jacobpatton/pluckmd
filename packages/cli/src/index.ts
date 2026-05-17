#!/usr/bin/env node

import { Command } from "commander";
import { downloadCommand } from "./commands/download.js";
import type { AuthMode } from "./commands/download.js";
import { inspectCommand } from "./commands/inspect.js";
import { loginCommand } from "./commands/login.js";
import { setupCommand } from "./commands/setup.js";

const program = new Command();
const DEFAULT_DOWNLOAD_LIMIT = 100;
const DEFAULT_PAGINATION_TIMEOUT_MS = 5 * 60 * 1000;

program
  .name("harvest")
  .description("Bulk download blog articles as Markdown files")
  .version("0.1.0");

program
  .command("download <url>")
  .description("Download articles from a blog/magazine URL")
  .option("-o, --output <dir>", "Output directory", "./articles")
  .option(
    "--auth <mode>",
    "Auth mode: auto, extension, profile",
    "auto",
  )
  .option("-c, --concurrency <n>", "Parallel downloads", "2")
  .option("--delay <ms>", "Delay between requests (ms)", "500")
  .option("--limit <n>", "Max articles to download", String(DEFAULT_DOWNLOAD_LIMIT))
  .option(
    "--pagination-timeout <ms>",
    "Max time to spend collecting paginated listing links (ms)",
    String(DEFAULT_PAGINATION_TIMEOUT_MS),
  )
  .option("--no-llm", "Disable LLM fallback for generic extraction")
  .option("--render <mode>", "Generic extraction render mode: auto, never, always", "auto")
  .option("--refresh-adapter", "Bypass cached generic adapter specs")
  .action(async (url: string, opts: Record<string, string | boolean | undefined>) => {
    await downloadCommand(url, {
      output: opts.output as string,
      auth: opts.auth as AuthMode,
      concurrency: Number(opts.concurrency),
      delay: Number(opts.delay),
      limit: Number(opts.limit),
      paginationTimeoutMs: Number(opts.paginationTimeout),
      noLlm: opts.llm === false,
      render: opts.render as "auto" | "never" | "always",
      refreshAdapter: Boolean(opts.refreshAdapter),
    });
  });

program
  .command("inspect <url>")
  .description("Inspect generic adapter resolution for a listing URL")
  .option("--explain", "Show resolution details", true)
  .option("--no-llm", "Disable LLM fallback")
  .option("--render <mode>", "Render mode: auto, never, always", "auto")
  .option("--refresh-adapter", "Bypass cached adapter specs")
  .action(async (url: string, opts: Record<string, string | boolean | undefined>) => {
    await inspectCommand(url, {
      explain: Boolean(opts.explain),
      noLlm: opts.llm === false,
      render: opts.render as "auto" | "never" | "always",
      refreshAdapter: Boolean(opts.refreshAdapter),
    });
  });

program
  .command("login <site>")
  .description("Log in to a site (note, zenn, qiita, hatena, medium)")
  .action(async (site: string) => {
    await loginCommand(site);
  });

program
  .command("setup")
  .description("Install AI agent skills (Claude Code, Codex, Cursor, etc.)")
  .option(
    "--agent <type>",
    "Agent type: claude-code, agents, all",
    "all",
  )
  .option("--target <dir>", "Target directory for AGENTS.md", ".")
  .action(async (opts: Record<string, string>) => {
    await setupCommand({
      agent: opts.agent as "claude-code" | "agents" | "all",
      target: opts.target,
    });
  });

program.parse();
