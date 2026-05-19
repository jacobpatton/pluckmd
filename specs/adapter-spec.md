# AdapterSpec and Shared Contracts

## AdapterSpec

`AdapterSpec` is the runtime extraction contract. It is deliberately data-only so
heuristics, LLMs, agents, and humans can produce the same shape.

```typescript
interface AdapterSpec {
  id?: string;
  listing: ListingExtractionSpec;
  article: ArticleExtractionSpec;
  pagination: PaginationSpec;
  waitStrategy?: WaitStrategy;
  evidence: string;
}
```

## ListingExtractionSpec

Defines how article links are selected from a listing page.

- `articleLinkSelector`: CSS selector for candidate links.
- `articleLinkHrefPattern`: regex source matched against normalized URL
  pathnames.
- `containerSelector`: optional scope for link lookup.
- `excludeSelectors`: optional regions removed before link collection.

## ArticleExtractionSpec

Defines how an article page body and metadata are extracted.

- `method`: `readability` or `selector`.
- `contentSelector`: required only when selector extraction is desired.
- `metadataSelectors`: optional selectors for title, author, date, and tags.

## PaginationSpec

Supported methods:

- `none`
- `scroll`
- `button-click`
- `next-url`
- `auto`

Optional fields:

- `selector`: button or next-link selector.
- `textPatterns`: button text fallback patterns.
- `urlTemplate`: page URL template using `{n}`.

## PageAnalysisInput

Boundary between acquisition and analysis.

Fields:

- `requestedUrl`
- `finalUrl`
- `status`
- `html`
- `source`: `static` or `rendered`
- `renderMode`: `auto`, `never`, or `always`
- `evaluator`: optional live DOM evaluator for rendered pages

## DomEvaluator

Optional live DOM API used by collectors/validators.

Capabilities:

- count selected elements
- read text
- read hrefs
- click selector
- click by text
- click structural pagination candidate
- scroll to bottom
- navigate
- read current HTML
- read current URL
- wait

Implementations:

- Playwright-backed evaluator in `RenderingPageAcquirer`
- extension-backed evaluator in `ExtensionFetcher`

## Protocol

The extension bridge protocol is versioned with `PROTOCOL_VERSION`.

Request types:

- `ping`
- `fetch`
- `active-tab`
- `dom-eval`

Responses must include the request `id` and `ok` status. Errors use a structured
`{ code, message }` object.
