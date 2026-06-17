# Research: Current-Page Scrape Mode

**Date**: 2026-06-17

## Decision: Reuse `downloadSingleArticle`

- **Decision**: Implement `--current-page` by calling the existing `downloadSingleArticle` function directly, skipping `runGenericDownload`.
- **Rationale**: `downloadSingleArticle` already performs exactly the required behaviour — it accepts a `PageAnalysisInput`, applies Readability extraction, converts to Markdown, and writes the output file — without any adapter resolution, link collection, or pagination. It is currently used as a fallback path when `resolveGenericAdapterSpec` fails. Reusing it avoids duplication.
- **Alternatives considered**: (1) Adding a flag check inside `runGenericDownload` to short-circuit early — rejected because it would leave adapter resolution and source acquisition on the hot path before the branch; (2) New standalone function — unnecessary code duplication given the fallback already exists.

## Decision: Warn on crawling flags using `getOptionValueSource`

- **Decision**: Use Commander's `cmd.getOptionValueSource(key)` to detect whether crawling-scoped flags (`--limit`, `--pagination-timeout`, `--refresh-adapter`) were explicitly set by the user (source `"cli"`) before emitting warnings.
- **Rationale**: Emitting warnings for flags at their default values would produce noise on every `--current-page` invocation (since `--limit` always has a default of 100). Only warn when the user explicitly supplied a value that will be silently ignored.
- **Alternatives considered**: Always warning regardless of source — rejected for producing noisy output; Removing default values for crawling flags — too broad a change.

## Decision: `--active-tab` path unchanged

- **Decision**: `createDownloadSource` is shared between the `--current-page` and normal flows; the extension bridge path for `--active-tab` is not modified.
- **Rationale**: `createDownloadSource` returns a source with an `acquireListing()` method. With `--current-page`, we call `acquireListing()` directly and feed the result to `downloadSingleArticle`, which works identically for both the URL and `--active-tab` sources.
- **Alternatives considered**: Separate code paths for `--active-tab --current-page` vs URL `--current-page` — unnecessary since the abstraction already handles both.
