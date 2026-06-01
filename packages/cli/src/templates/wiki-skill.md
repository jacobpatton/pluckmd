---
description: "Build and manage an LLM Wiki from articles fetched with pluckmd. 5 operations: init/ingest/query/lint/status."
---

# pluckmd wiki

Build a Wiki knowledge base from articles fetched with pluckmd.

Usage: `/pluckmd-wiki <init|ingest|query|lint|status> [options]`

## init <path>
Create raw/, wiki/, CLAUDE.md, index.md, log.md. Generate a tag taxonomy tailored to the domain.

## ingest [--batch N]
Convert unprocessed files in raw/ into Wiki entries. Add bidirectional Wikilinks. Update index.md and log.md.

## query "<question>"
Search the Wiki and synthesize an answer. Good answers can be saved to wiki/.

## lint [--fix]
Check for orphan pages, broken Wikilinks, un-ingested files, and more.

## status
Display source count, entry count, coverage, and last ingest timestamp.
