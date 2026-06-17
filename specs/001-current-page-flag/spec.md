# Feature Specification: Current-Page Scrape Mode

**Feature Branch**: `001-current-page-flag`  
**Created**: 2026-06-17  
**Status**: Draft  
**Input**: User description: "add a --current-page flag to target scraping to the current page (either the URL passed to the command or the --current-tab). This should circumvent any page-crawling activity and only scrape the contents of the provided page."

## Clarifications

### Session 2026-06-17

- Q: When `--current-page` is combined with crawling-scoped flags (e.g., `--limit`, `--page-limit`), should the tool silently ignore them or emit a non-fatal warning? → A: Emit a non-fatal warning to stderr, then proceed.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Scrape a single known URL directly (Priority: P1)

A user has a specific article or page URL and wants to capture its content as Markdown without any link discovery, pagination traversal, or adapter inference. They run `pluckmd download --current-page <url>` and receive a single output file containing that page's content.

**Why this priority**: This is the primary use case — a direct, fast path that skips all crawling overhead. It delivers value on its own without any other stories.

**Independent Test**: Can be fully tested by running `pluckmd download --current-page https://example.com/article` and verifying a single output file is written containing the article content, with no additional HTTP requests to other pages.

**Acceptance Scenarios**:

1. **Given** a valid URL is passed to `download`, **When** `--current-page` is also passed, **Then** the tool fetches only that URL, converts its content to Markdown, and writes one output file without visiting any other URLs.
2. **Given** `--current-page` is active, **When** the page contains links to other articles or pagination controls, **Then** those links are ignored and no additional pages are fetched.
3. **Given** `--current-page` is active, **When** the page fetch succeeds, **Then** no adapter resolution, heuristic analysis, or LLM calls occur.

---

### User Story 2 - Scrape the active browser tab directly (Priority: P2)

A user is browsing a page (e.g., a paywalled or authenticated article) in Chrome with the extension installed. They run `pluckmd download --current-page --current-tab` and receive a Markdown file of the tab's current content without any crawling.

**Why this priority**: Builds on P1 but requires the extension bridge. Delivers the authenticated-content use case that is a key differentiator of the tool.

**Independent Test**: Can be fully tested by having a browser tab open, running `pluckmd download --current-page --current-tab`, and confirming the output matches the tab's content with no additional navigation.

**Acceptance Scenarios**:

1. **Given** the Chrome extension is connected and a tab is active, **When** `--current-page --current-tab` is passed, **Then** the tool acquires the tab's page content via the extension bridge and writes one output file.
2. **Given** `--current-page --current-tab` is active, **When** the tab URL would normally trigger link collection or pagination, **Then** only the tab's current content is captured.

---

### Edge Cases

- What happens when `--current-page` is passed without a URL and without `--current-tab`? The command should exit with a clear error indicating that a target is required.
- What happens if the page fetch fails (network error, 404)? The tool should surface the error and exit non-zero, same as the normal failure path.
- What happens when `--current-page` is combined with flags that imply crawling (e.g., `--limit`, `--page-limit`)? The tool emits a non-fatal warning to stderr for each such flag (e.g., `warning: --limit has no effect with --current-page`) and then proceeds.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The `download` command MUST accept a `--current-page` boolean flag.
- **FR-002**: When `--current-page` is set, the tool MUST skip link collection, pagination traversal, and adapter resolution entirely.
- **FR-003**: When `--current-page` is set, the tool MUST fetch and convert only the single target URL (from the command argument or from the active browser tab if `--current-tab` is also set).
- **FR-004**: When `--current-page` is set, the tool MUST still apply content extraction (readability parsing + Markdown conversion) and write the output file in the same format as a normal single-article result.
- **FR-005**: When `--current-page` is set without a URL argument and without `--current-tab`, the tool MUST exit with an informative error message.
- **FR-006**: When `--current-page` is set alongside crawling-scoped flags (e.g., `--limit`, `--page-limit`), the tool MUST emit a non-fatal warning to stderr indicating those flags have no effect, then proceed normally.

### Key Entities

- **Target URL**: The single page to be fetched — either the positional URL argument or the active tab URL obtained via the extension bridge.
- **Output file**: The single Markdown file produced, identical in format to a normal per-article output.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Running `download --current-page <url>` completes without making any HTTP requests beyond the single target URL.
- **SC-002**: The output file contains content sourced exclusively from the target URL, not from any linked pages.
- **SC-003**: Execution time with `--current-page` is measurably shorter than an equivalent run without the flag on the same URL (no adapter/LLM overhead).
- **SC-004**: 100% of error cases (missing target, failed fetch) produce a non-zero exit code and a human-readable error message.

## Assumptions

- The existing `page-acquirer` and `converter`/`writer` pipeline can be invoked directly for a single URL without requiring a resolved `AdapterSpec`.
- The `--current-tab` flag and extension bridge are already functional; this feature reuses them without modification.
- No new output format or file naming convention is needed — single-article output follows the existing scheme.
- Combining `--current-page` with `--output-dir` or `--filename` flags continues to work as expected.
