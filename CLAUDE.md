# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build      # tsup build for packages/shared and packages/cli
npm run dev        # run CLI directly via tsx (no build needed, from packages/cli)
npm run test       # vitest run (tests live in packages/cli/tests/)
npm run lint       # ESLint over packages/*/src
npm run clean      # delete packages/*/dist
```

Run a single test file: `npx vitest run packages/cli/tests/<file>.test.ts`

Node >= 20 required.

## Architecture

Monorepo with three packages:

- **`packages/shared`** — types only (`Fetcher`, `AdapterSpec`, `AdapterValidationResult`, WebSocket protocol types). No runtime logic.
- **`packages/cli`** — all runtime logic, published as `pluckmd` on npm.
- **`packages/extension`** — plain-JS unpacked Chrome Extension (no build step).

### Core pipeline (`packages/cli/src/`)

`download` command flow:

```
URL → generic-resolver → AdapterSpec → link-collector (paginated) → per-article: page-acquirer → converter → writer
```

**`core/generic-resolver.ts`** — three-stage resolution loop:

1. Load cached `AdapterSpec` from `~/.pluckmd/adapters/`
2. Run `HeuristicListingAnalyzer` (DOM-based CSS selector inference)
3. Fall back to LLM if heuristics yield confidence < 0.7 or fail validation

**`core/heuristic-analyzer.ts`** — DOM heuristics to detect article link selectors and pagination signals.

**`core/adapter-validator.ts`** — mechanically validates a proposed `AdapterSpec` against the live DOM.

**`core/llm/`** — OpenAI-compatible client; env vars: `PLUCKMD_LLM_API_KEY`, `PLUCKMD_LLM_BASE_URL`, `PLUCKMD_LLM_MODEL`. Sends a page snapshot to the LLM to select/refine selectors.

**`core/link-collector.ts`** — collects article URLs from a listing page using the resolved spec, including paginated traversal.

**`core/extension-fetcher.ts`** — WebSocket relay on `127.0.0.1:7432` for the Chrome extension bridge.

**`core/page-acquirer.ts`** — fetches pages via plain `undici` fetch or optional Playwright.

**`pipeline/converter.ts`** — HTML → Markdown via `@mozilla/readability` + `turndown` (GFM plugin).

**`pipeline/writer.ts`** — writes Markdown to disk with YAML front matter via `gray-matter`.

### Chrome Extension (`packages/extension/`)

Plain JS, no build. `background.js` auto-connects to the CLI relay on port 7432 via a 1-minute Chrome alarm. Handles `fetch`, `activeTab`, and `domEval` protocol requests from the CLI. This is what enables fetching authenticated/paid content — no manual token wiring needed.

### Key design decisions

- `AdapterSpec` is intentionally data-only JSON so it can be written by an LLM or human and validated mechanically. The agent-assisted path (`inspect --agent-request` / `--adapter-spec`) is first-class for sites where the LLM env vars aren't configured.
- The `skills/` directory contains Markdown skill files that `pluckmd setup` copies into a project for Claude Code (`CLAUDE.md`) or `AGENTS.md` for other AI agents — this is how the tool ships agent skills to users.
