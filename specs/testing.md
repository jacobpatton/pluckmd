# Testing Strategy

## Test Layers

### Unit Tests

Current unit coverage focuses on:

- adapter validation
- adapter cache behavior
- heuristic listing analysis
- link collection
- LLM resolver schema/config behavior
- download result aggregation

Unit tests should avoid real network calls unless explicitly scoped to local
fixtures.

### CLI Smoke Tests

`cli-smoke.test.ts` executes the CLI as a child process to verify:

- command help works without loading the extraction pipeline
- invalid numeric options fail before command execution

### Fixture E2E Tests

`cli-e2e-fixture.test.ts` starts an in-process HTTP server and runs the CLI
against deterministic local pages.

Covered behavior:

- static listing acquisition
- heuristic adapter resolution without LLM
- `rel=next` pagination
- article extraction
- Markdown writing
- `inspect` validation and link preview

These tests are intentionally independent of real websites.

## Required Quality Gates

Before merging or publishing:

```bash
npm run lint
npm run build
npm test
npm audit --audit-level=low
```

The extension scripts should also parse as plain JavaScript:

```bash
node -e "new Function(require('fs').readFileSync('packages/extension/src/background.js','utf8'))"
node -e "new Function(require('fs').readFileSync('packages/extension/src/popup.js','utf8'))"
```

## Future Coverage

Useful additions:

- local fixture for rendered/infinite-scroll behavior with Playwright
- local fixture for active-tab extension flow, if a stable browser automation
  harness is introduced
- writer tests for duplicate filenames and frontmatter escaping
- protocol tests for relay authorization and request timeout behavior
