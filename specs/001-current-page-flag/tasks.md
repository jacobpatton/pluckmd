# Tasks: Current-Page Scrape Mode

**Input**: Design documents from `specs/001-current-page-flag/`
**Prerequisites**: plan.md ✓ spec.md ✓ research.md ✓ contracts/cli-flag.md ✓

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Wire the `--current-page` flag through the CLI option layer. No story can be tested until this is complete.

**⚠️ CRITICAL**: Both source files must be updated before any user story can be verified.

- [x] T001 Add `currentPage?: boolean` to `DownloadCommandOptions` interface in `packages/cli/src/commands/download.ts`
- [x] T002 [P] Add `currentPage?: boolean` to `DownloadCliOptions` interface in `packages/cli/src/index.ts`
- [x] T003 Register `.option("--current-page", "Scrape only the target page without any crawling")` on the download command in `packages/cli/src/index.ts`
- [x] T004 Pass `currentPage: Boolean(opts.currentPage)` from the action handler into `downloadCommand` in `packages/cli/src/index.ts`

**Checkpoint**: Flag is wired end-to-end. `pluckmd download --help` shows `--current-page`.

---

## Phase 2: User Story 1 — Scrape a single known URL directly (Priority: P1) 🎯 MVP

**Goal**: When `--current-page` is passed, fetch and convert only the target URL — no adapter resolution, no link collection, no LLM calls.

**Independent Test**: Run `pluckmd download --current-page https://example.com/article` and verify exactly one output file is written with no additional HTTP requests.

### Implementation for User Story 1

- [x] T005 [US1] Add `--current-page` branch in `downloadCommand`: if `options.currentPage`, acquire the listing page then call `downloadSingleArticle` directly, skipping `runGenericDownload` entirely — in `packages/cli/src/commands/download.ts`
- [x] T006 [US1] Add warning logic in the download action handler in `packages/cli/src/index.ts`: for each of `--limit`, `--pagination-timeout`, `--refresh-adapter`, if `cmd.getOptionValueSource(key) === "cli"`, emit `warning: --<flag> has no effect with --current-page` to `process.stderr`, then proceed
- [x] T007 [P] [US1] Add smoke test asserting `--current-page` appears in `pluckmd download --help` output in `packages/cli/tests/cli-smoke.test.ts`
- [x] T008 [P] [US1] Add smoke test asserting that running `download --current-page --limit 5 https://example.com` emits a `warning: --limit has no effect with --current-page` line on stderr (use a mock/stub or run against a local fixture that returns immediately) in `packages/cli/tests/cli-smoke.test.ts`

**Checkpoint**: User Story 1 fully functional. `--current-page <url>` produces one Markdown file with no crawling overhead.

---

## Phase 3: User Story 2 — Scrape the active browser tab directly (Priority: P2)

**Goal**: `--current-page --active-tab` scrapes the current Chrome tab's content directly without any crawling.

**Independent Test**: With extension connected and a tab open, `pluckmd download --current-page --active-tab` writes one Markdown file matching the tab's content.

**Note**: No additional implementation is required. The `createDownloadSource` abstraction already returns a source whose `acquireListing()` delegates to `extensionFetcher.acquireActiveTab()` when `--active-tab` is set. The `--current-page` branch added in T005 calls `source.acquireListing()` regardless of source type, so US2 is covered by T005.

### Implementation for User Story 2

- [x] T009 [US2] Add a code comment in `downloadCommand` in `packages/cli/src/commands/download.ts` (adjacent to the `--current-page` branch from T005) noting that this path handles both URL and `--active-tab` sources through the `DownloadSource` abstraction
- [x] T010 [P] [US2] Update the `--active-tab` option description in `packages/cli/src/index.ts` to mention it is compatible with `--current-page`

**Checkpoint**: Both user stories complete. The `DownloadSource` abstraction covers both URL and extension-bridge paths transparently.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [x] T011 [P] Run `npm run test` from the repo root and confirm all existing tests pass with no regressions
- [x] T012 [P] Run `npm run lint` from the repo root and confirm no lint errors in modified files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately
- **User Story 1 (Phase 2)**: Depends on Phase 1 completion (T001–T004)
- **User Story 2 (Phase 3)**: Depends on Phase 2 completion (T005)
- **Polish (Phase 4)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: No story dependencies — start after Foundational
- **US2 (P2)**: Implementation covered by T005 (US1) — only documentation tasks remain

### Parallel Opportunities

Within Phase 1: T002 and T003 and T004 can all run in parallel (all in `index.ts`, but different sections — edit carefully or serialize)
Within Phase 2: T007 and T008 can run in parallel once T005 is done

---

## Parallel Example: Phase 1

```bash
# T001 and T002 are in different files — run in parallel:
Task: "T001 Add currentPage to DownloadCommandOptions in packages/cli/src/commands/download.ts"
Task: "T002 Add currentPage to DownloadCliOptions in packages/cli/src/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (T001–T004)
2. Complete Phase 2 implementation tasks: T005, T006
3. **VALIDATE**: Run `pluckmd download --current-page <url>` and confirm single-file output
4. Complete Phase 2 tests: T007, T008

### Incremental Delivery

1. Foundational → flag appears in `--help`
2. US1 implementation → `--current-page <url>` works, warnings emit
3. US2 doc tasks → `--current-page --active-tab` confirmed by abstraction
4. Polish → all tests green

---

## Notes

- `downloadSingleArticle` already exists in `download.ts` — T005 reuses it; do not duplicate it
- Use `cmd.getOptionValueSource(key)` (Commander's third action arg) to detect explicit CLI usage vs defaults for warning logic
- No new output format, file naming, or data model changes
