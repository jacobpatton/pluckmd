# Generic Extraction Pipeline

## Purpose

The generic extraction pipeline replaces source-code site adapters with runtime
data. It should handle unknown sites by selecting and validating `AdapterSpec`
objects rather than branching on domains.

## Components

### `RenderingPageAcquirer`

Acquires `PageAnalysisInput` from a URL.

- `render=never`: static fetch only.
- `render=always`: Playwright rendering only.
- `render=auto`: static fetch first, then render when the static HTML appears
  JavaScript-heavy.

Static fetch uses a browser-like user agent. Rendered acquisition uses a
persistent Chromium profile under the harvest config directory.

### `ExtensionFetcher`

Acquires `PageAnalysisInput` from the active Chrome tab or browser-authenticated
fetches through the local extension bridge.

It provides a live `DomEvaluator` so link collection can scroll, click, inspect
hrefs, read text, navigate, and refresh rendered HTML.

### `resolveGenericAdapterSpec`

Resolution order:

1. Load and validate cache unless `refreshAdapter` is set.
2. Run `HeuristicListingAnalyzer`.
3. Validate the heuristic spec.
4. If valid and confidence is high enough, cache and return it.
5. If heuristics fail and `noLlm` is true, fail.
6. If LLM config is missing, throw `LlmConfigurationError`.
7. Otherwise ask the OpenAI-compatible LLM resolver to refine/select a spec.
8. Cache only validated specs.

### `HeuristicListingAnalyzer`

Finds repeated article-link candidates from static DOM structure:

- removes common navigation/sidebar/footer/recommendation regions
- groups same-host links by path pattern
- requires repeated unique links
- scores by count, ratio, path depth, and container quality
- detects pagination from `rel=next`, structural controls, page-like query
  parameters, pagination regions, and feed-like DOM signals

Heuristics should remain domain-agnostic.

### `validateAdapterSpec`

Mechanically validates that a spec can select article links from the current
HTML/DOM.

Validation protects the cache and prevents LLM output from being used without
DOM evidence.

### `GenericLinkCollector`

Collects article links until one stop condition is reached:

- `complete`
- `limit`
- `max-iterations`
- `max-time`
- `duplicates`
- `unchanged-dom`

Supported pagination modes:

- `none`: collect current page only.
- `next-url`: follow normalized next URLs. For rendered pages, use
  `DomEvaluator.navigate` when available.
- `button-click`: try text patterns, selector click, then scroll fallback.
- `scroll`: scroll and refresh rendered DOM.
- `auto`: scroll, then try structural click candidates, then refresh DOM.

### `ReadabilityArticleExtractor`

Extracts article metadata and body HTML.

Priority:

1. Explicit metadata selectors from `AdapterSpec`.
2. Common document elements such as `h1`, `title`, and `time`.
3. Metadata hints from listing links.
4. Mozilla Readability for body content.
5. `article` or `main` fallback.

Empty content is treated as an extraction failure for that article.

### Converter and Writer

`convertHtmlToMarkdown` uses Turndown with GFM support and removes script,
style, nav, footer, and iframe content.

`writeArticle` writes frontmatter plus Markdown body and avoids filename
collisions by suffixing duplicate names.

## Agent-Assisted Path

When heuristics cannot resolve a valid spec and LLM settings are unavailable,
`inspect` writes an agent request JSON under the harvest config directory. A
coding agent can read the observed candidates and produce an `AdapterSpec` JSON.
The user then validates and caches it through `--adapter-spec`.

## Invariants

- No domain-specific source-code adapter should be required for normal support.
- Cache entries must be revalidated before use.
- LLM/agent output must be data-only and validated before cache/use.
- Link collection must respect `limit` and timeout settings.
