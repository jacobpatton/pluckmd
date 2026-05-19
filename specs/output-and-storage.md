# Output and Storage

## Markdown Output

Each downloaded article is written as a Markdown file with YAML-like
frontmatter.

```markdown
---
title: "Article Title"
date: 2026-05-19
source: https://example.com/article
author: Author Name
tags: [tag1, tag2]
---

# Article Title

Article body...
```

## Filename Rules

`writeArticle` derives filenames from article titles.

Rules:

- remove characters invalid on common filesystems
- collapse whitespace to underscores
- truncate long names
- append `-2`, `-3`, etc. when a filename already exists

## Adapter Cache

Validated adapter specs are cached under the harvest config directory in
`adapters/*.json`.

Cache behavior:

- cache keys are normalized from URL shape
- corrupt entries are ignored
- stale entries fall back to fresh analysis
- cached specs are revalidated before use
- successful validation updates cache usage metadata

## Agent Requests

When heuristics are insufficient and LLM configuration is missing, `inspect`
writes an agent request JSON under `~/.harvest/agent-requests/`.

The request contains page observations and candidate selectors so an external
agent can produce an `AdapterSpec`.

## Browser Profile

The Playwright browser profile is stored under the harvest config directory.

It is used by:

- `harvest login`
- rendered acquisition through `RenderingPageAcquirer`

The extension path does not read this profile; it delegates auth to the active
Chrome session.
