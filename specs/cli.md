# CLI Specification

## Executable

`pluckmd` is defined in `packages/cli/src/index.ts`.

The CLI must validate options before invoking command implementations. Invalid
numeric values should fail fast through commander argument validation rather than
starting network or browser work.

## `pluckmd download [url]`

Downloads articles from a listing page.

### Inputs

- `url`: optional only when `--active-tab` is set.
- `--output <dir>`: output directory. Default: `./articles`.
- `--concurrency <n>`: positive integer. Default: `2`.
- `--delay <ms>`: non-negative integer. Default: `500`.
- `--limit <n>`: positive integer. Default: `100`.
- `--pagination-timeout <ms>`: positive integer. Default: `300000`.
- `--no-llm`: disables LLM fallback.
- `--render <auto|never|always>`: page acquisition mode. Default: `auto`.
- `--refresh-adapter`: bypasses cached adapter specs.
- `--active-tab`: uses the Chrome extension bridge as the listing page source.

### Behavior

1. Create a `DownloadSource`:
   - URL mode uses `RenderingPageAcquirer`.
   - active-tab mode uses `ExtensionFetcher`.
2. Resolve a generic `AdapterSpec`.
3. Collect article links with `GenericLinkCollector`.
4. Download articles concurrently with the configured limit.
5. Convert each article to Markdown and write it to disk.
6. Report saved/failed counts.
7. Close browser/extension resources in `finally`.

### Failure Semantics

- Individual article failures are recorded in `DownloadResult.errors`.
- A failed article does not abort the remaining batch.
- If any article fails, the reporter sets `process.exitCode = 1`.
- Setup/acquisition/resolution failures abort the command.

## `pluckmd inspect [url]`

Inspects adapter resolution for a listing page.

### Inputs

- `url`: optional only when `--active-tab` is set.
- `--explain`: prints detailed resolution explanation.
- `--no-llm`: disables LLM fallback.
- `--render <auto|never|always>`: page acquisition mode.
- `--refresh-adapter`: bypasses cached adapter specs.
- `--active-tab`: uses the extension bridge.
- `--agent-request [file]`: writes agent-readable request when LLM config is
  missing.
- `--adapter-spec <file>`: validates and caches a provided spec.

### Behavior

1. Acquire `PageAnalysisInput`.
2. Print render source, final URL, and HTTP status.
3. If `--adapter-spec` is set:
   - parse JSON
   - validate schema
   - validate against current DOM/HTML
   - cache validated spec
4. Otherwise resolve a generic adapter spec.
5. Print selector, validation, pagination, and preview details.
6. If LLM config is required but missing, write an agent request and set exit
   code `1`.

## `pluckmd login <url>`

Opens a login URL using the persistent Playwright browser profile.

### Behavior

1. Validate that the target is a full URL.
2. Launch Chromium with `headless: false`.
3. Reuse the pluckmd profile directory.
4. Wait until the browser context closes.

## `pluckmd setup`

Installs agent skills from `packages/cli/src/templates`.

### Inputs

- `--agent <claude-code|agents|all>`
- `--target <dir>`

### Behavior

Copies skill templates into the requested target locations. It is independent of
the extraction pipeline.
