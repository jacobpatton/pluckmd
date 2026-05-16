#!/usr/bin/env node

import { Command } from "commander";
import { downloadCommand } from "./commands/download.js";
import type { AuthMode } from "./commands/download.js";
import { loginCommand } from "./commands/login.js";
import { setupCommand } from "./commands/setup.js";

const program = new Command();

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
  .option("--limit <n>", "Max articles to download")
  .action(async (url: string, opts: Record<string, string>) => {
    await downloadCommand(url, {
      output: opts.output,
      auth: opts.auth as AuthMode,
      concurrency: Number(opts.concurrency),
      delay: Number(opts.delay),
      limit: opts.limit ? Number(opts.limit) : undefined,
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
