---
description: "Build and manage an LLM Wiki from articles fetched with harvest. 5 operations: init/ingest/query/lint/status."
---

# harvest wiki — LLM Wiki

A Wiki knowledge base that an LLM incrementally builds and maintains from Markdown articles fetched with harvest.

## Usage

```
/harvest-wiki <operation> [options]
```

## Operations

### `init <path>`

Initialize a Wiki project.

1. Create directory structure (raw/, wiki/concepts/, wiki/topics/, wiki/timeline/)
2. Infer domain from filenames in `raw/`
3. Generate CLAUDE.md (Schema: frontmatter conventions, tag taxonomy, Wikilink conventions, writing style rules)
4. Create index.md (skeleton) and log.md
5. Ask the user to review and adjust the tag taxonomy

### `ingest [--batch N] [--filter pattern]`

Ingest sources into the Wiki. Run from the project root (where CLAUDE.md is located).

1. Check log.md to identify already-ingested files
2. List unprocessed files in raw/ (limit with --batch N, filter with --filter)
3. Read each file and extract title, date, key concepts, arguments, and domain-specific terms
4. Use index.md to determine relationships with existing entries
5. Create new entries or update existing ones + add bidirectional Wikilinks
6. Record in log.md and update index.md

Wiki entry frontmatter:
```yaml
---
title: "Title"
aliases: ["Alternate names"]
tags: [tag1, tag2]
sources: ["[[raw/filename]]"]
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: concept | topic-overview | chapter-summary | timeline | glossary
status: draft
---
```

Body: Bold summary at the top, `##` section headings, `(ref: [[raw/filename]])` for citations, `## Related` section at the end.

### `query "<question>"`

index.md → Grep → Load related entries → Synthesize answer (with Wikilink citations). Good answers can be saved to wiki/.

### `lint [--fix]`

Checks: orphan pages, broken Wikilinks, missing frontmatter, untagged entries, un-ingested files, contradictory statements, missing cross-references.

### `status`

Source count, entry count, coverage, last ingest timestamp, and 5 most recent log entries.

## Principles

- Raw is immutable; Wiki is entirely generated (can be regenerated)
- Incremental construction (batch processing)
- Obsidian-compatible (Wikilinks, YAML frontmatter)
