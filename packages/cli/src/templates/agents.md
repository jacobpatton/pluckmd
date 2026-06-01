# pluckmd — Agent Skills

## wiki init <path>
Create wiki structure: raw/, wiki/, CLAUDE.md, index.md, log.md.

## wiki ingest [--batch N]
Process raw/ articles into wiki entries with frontmatter, wikilinks, and cross-references.

## wiki query "<question>"
Search wiki and synthesize answers with citations.

## wiki lint [--fix]
Check wiki health: orphan pages, broken links, missing frontmatter, un-ingested files.

## slides <wiki-entry>
Generate interactive HTML slides (dark theme, SVG diagrams, keyboard/touch nav) from wiki entries.
Save to wiki/slides/<name>.html.
