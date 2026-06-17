# Implementation Plan: Current-Page Scrape Mode

**Branch**: `001-current-page-flag` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

## Summary

Add a `--current-page` boolean flag to the `download` command that bypasses all crawling activity (adapter resolution, link collection, pagination) and scrapes only the single target URL — either the positional URL argument or the active browser tab. The implementation reuses the existing `downloadSingleArticle` function, which already performs the exact behaviour required.

## Technical Context

**Language/Version**: TypeScript, Node >= 20  
**Primary Dependencies**: Commander.js (CLI), Vitest (tests)  
**Storage**: N/A  
**Testing**: Vitest + Node child_process (CLI smoke tests)  
**Target Platform**: macOS/Linux CLI  
**Project Type**: CLI tool  
**Performance Goals**: No overhead added — fewer code paths than the default flow  
**Constraints**: Must not alter existing download behaviour when flag is absent  
**Scale/Scope**: 2 source files changed, 1 test file added/extended

## Constitution Check

No project constitution is configured. No gates to evaluate.

## Project Structure

### Documentation (this feature)

```text
specs/001-current-page-flag/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── contracts/
│   └── cli-flag.md      ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/cli/src/
├── index.ts                     ← add --current-page flag + warning logic
└── commands/
    └── download.ts              ← add currentPage option, branch in downloadCommand

packages/cli/tests/
└── current-page.test.ts         ← new test file
```

## Implementation Design

### Flag registration (`packages/cli/src/index.ts`)

Add `.option("--current-page", "Scrape only the target page without crawling")` to the `download` command.

In the `.action` handler, receive the Command instance as the third argument and emit stderr warnings when `--current-page` is set alongside any of these crawling-scoped flags that were explicitly provided on the CLI:

- `--limit`
- `--pagination-timeout`
- `--refresh-adapter`

Warning format: `warning: --<flag> has no effect with --current-page`

Use `cmd.getOptionValueSource(key)` to distinguish CLI-supplied values from defaults — warn only when source is `"cli"`.

Pass `currentPage: Boolean(opts.currentPage)` into `downloadCommand`.

### Download command branch (`packages/cli/src/commands/download.ts`)

Add `currentPage?: boolean` to `DownloadCommandOptions`.

In `downloadCommand`, branch immediately after acquiring the source:

```
if (options.currentPage) {
  // acquire the listing page (handles both --active-tab and URL cases)
  // call downloadSingleArticle directly — skips all crawling
} else {
  // existing runGenericDownload path
}
```

`downloadSingleArticle` already exists and does exactly what is needed: fetches a page, applies Readability extraction, converts to Markdown, and writes the output file.

### No new data model

This feature introduces no new entities. The output file format is identical to existing single-article output.

## Complexity Tracking

No violations. This feature strictly reduces code paths — `--current-page` skips resolver, collector, and LLM entirely.
