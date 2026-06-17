# Contract: `--current-page` CLI Flag

**Command**: `pluckmd download`

## Flag Definition

| Property                | Value                                                         |
| ----------------------- | ------------------------------------------------------------- |
| Flag                    | `--current-page`                                              |
| Type                    | Boolean (presence flag, no argument)                          |
| Default                 | `false` (absent)                                              |
| Mutually exclusive with | None (combinable with `--active-tab`, `--output`, `--render`) |

## Behaviour Contract

When `--current-page` is present:

1. The tool fetches exactly one page (the target URL or active tab).
2. No adapter resolution, heuristic analysis, or LLM calls occur.
3. No link collection or pagination traversal occurs.
4. Content is extracted and written as a single Markdown file, identical in format to a normal per-article result.
5. Exit code 0 on success, non-zero on fetch failure or missing target.

## Warning Contract

When `--current-page` is combined with any of the following flags that were **explicitly provided** on the command line, the tool emits one warning per flag to stderr before proceeding:

- `--limit`
- `--pagination-timeout`
- `--refresh-adapter`

Warning format: `warning: --<flag-name> has no effect with --current-page`

## Error Contract

| Condition                              | Behaviour                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| No URL and no `--active-tab`           | Exit non-zero with message: `error: URL is required unless --active-tab or --current-page with --active-tab is set` |
| Page fetch fails (network / 4xx / 5xx) | Exit non-zero with human-readable error message                                                                     |
