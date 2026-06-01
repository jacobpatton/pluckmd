# pluckmd — Agent Skills

This document defines reusable skills for AI coding agents (Codex, Cursor, Windsurf, Cline, Aider, etc.) working with the pluckmd project.

## Available Skills

1. **pluckmd-download** — Bulk download blog articles as Markdown via pluckmd CLI
2. **pluckmd-wiki** — Build and maintain an LLM Wiki from pluckmded articles
3. **pluckmd-slides** — Generate interactive HTML slides from wiki entries

---

## Skill: pluckmd-download

### Purpose
Bulk download blog articles as Markdown files using the pluckmd CLI. Handles authenticated/paid content via a dedicated browser profile.

### Prerequisites
```bash
npm install -g pluckmd
npx playwright install chromium
```

### Commands

#### `pluckmd login <login-url>`

Open browser for manual login. Session is saved for future use.

#### `pluckmd download <url> [options]`

Download all articles from a listing page.

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <dir>` | Output directory | `./articles` |
| `-c, --concurrency <n>` | Parallel downloads | `2` |
| `--delay <ms>` | Delay between requests | `500` |
| `--limit <n>` | Max articles | unlimited |

### Common Patterns

Magazine (all articles):
```bash
pluckmd download <url> -o ./raw
```

User profile (all articles):
```bash
pluckmd download <url> -o ./raw
```

Test with limit:
```bash
pluckmd download <url> --limit 5 -o /tmp/test
```

### Troubleshooting

- **SingletonLock error**: `rm -f ~/.pluckmd/chrome-profile/SingletonLock`
- **Playwright not installed**: `npm install playwright && npx playwright install chromium`
- **Partial results**: Use `--active-tab` with the page open in Chrome, increase `--limit`, or increase `--pagination-timeout`

---

## Skill: pluckmd-wiki

### Purpose
Build a persistent, structured wiki knowledge base from raw Markdown articles downloaded by pluckmd. The wiki compounds knowledge over time — unlike RAG, which re-derives answers from scratch on every query.

### Architecture (3 Layers)
- `raw/` — Immutable source articles (never modify)
- `wiki/` — LLM-generated structured entries (concepts, topics, timeline, glossary)
- `CLAUDE.md` / `AGENTS.md` — Schema defining conventions, tags, wikilink rules

### Commands

#### `wiki init <path>`

Create wiki directory structure at `<path>`:

```
<path>/
  CLAUDE.md or AGENTS.md    # Schema
  index.md                   # Master navigation
  log.md                     # Append-only changelog
  raw/                       # Source articles
  wiki/
    concepts/                # Concept/theory pages
    topics/                  # Theme clusters
    timeline/                # Chronological summaries
    glossary.md
    themes.md
```

Steps:
1. Create directory structure
2. Scan `raw/` filenames to understand the domain
3. Generate schema file with: frontmatter spec, tag taxonomy, wikilink conventions, writing rules
4. Generate skeleton `index.md` and initial `log.md`
5. Ask user to review and adjust tag taxonomy

#### `wiki ingest [--batch N] [--filter pattern]`

Process raw source files into wiki entries.

Steps:
1. Read `log.md` to find already-ingested files
2. List unprocessed files in `raw/`
3. Limit to N files (default: 10) or filter by pattern
4. For each source file:
   - Read and extract: title, date, key concepts, arguments, terminology
   - Check `index.md` for related existing entries
   - Create new wiki entry OR update existing entry
   - Add bidirectional wikilinks
   - Append to `log.md`
5. Update `index.md`

Wiki entry format:
```markdown
---
title: "Entry Title"
aliases: ["alt name"]
tags: [tag1, tag2]
sources:
  - "[[raw/source-filename]]"
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: concept | topic-overview | chapter-summary | timeline | glossary
status: draft
---

# Entry Title

**Bold 2-3 sentence summary.**

## Section

Content with source references (ref: [[raw/filename]])

## Related

- [[wiki/concepts/related-concept]]
```

#### `wiki query "<question>"`

1. Read `index.md` for overview
2. Search wiki entries for relevant content
3. Synthesize answer with wikilink citations
4. Optionally save good answers as new wiki pages

#### `wiki lint [--fix]`

Check wiki health:
- Orphan pages (not linked from index.md)
- Broken wikilinks
- Missing frontmatter fields
- Untagged entries
- Un-ingested raw files
- Missing cross-references

#### `wiki status`

Print: source count, entry count, coverage %, last ingest date, recent log entries.

### Design Principles
- Raw files are immutable
- Wiki entries are regenerable from raw
- Build incrementally in batches
- All wikilinks use `[[path/name]]` format (Obsidian-compatible)
- YAML frontmatter on every entry

---

## Skill: pluckmd-slides

### Purpose
Generate interactive HTML slide decks from wiki entries. Each slide deck visually explains one concept or topic using SVG diagrams, cards, and animations.

### Command

```
slides <wiki-entry-path-or-name>
```

Examples:
```
slides wiki/concepts/agility
slides wiki/topics/agent-era/overview
slides "KPI Model"
```

### Process

1. **Read source**: Read the wiki entry + its linked raw sources + related entries
2. **Design slides**: Plan 5-12 slides, each focused on one point
3. **Generate HTML**: Single self-contained HTML file with inline CSS/JS/SVG
4. **Save**: Write to `wiki/slides/<kebab-name>.html`

### Slide Types

| Type | Use | Visual |
|------|-----|--------|
| title | Introduction | SVG icon + subtitle |
| definition | Define concept | Quote block + keyword badges |
| comparison | Before/After | Side-by-side cards or table |
| flow | Process/steps | Arrow flow diagram |
| tree | Hierarchy | SVG tree diagram |
| matrix | 2-axis analysis | SVG quadrant chart |
| cards | Parallel elements | 3-4 card layout |
| metaphor | Analogy | SVG illustration |
| stat | Key number | Large stat display |
| summary | Recap | Pyramid or checklist |

### HTML Template Requirements

**Design:**
- Dark theme: `#0f0f1a` bg, `#1a1a2e` surface, `#e94560` accent, `#f5c842` gold
- Font: `'Helvetica Neue', 'Hiragino Sans', sans-serif`
- All illustrations as inline SVG (no external images)
- Cards: `border-radius: 16px`, hover float effect
- Responsive: `@media (max-width: 768px)`

**Interactivity (all in single HTML file):**
- Keyboard: ← → arrows and space
- Touch: swipe left/right
- Dot indicators (clickable)
- Prev/Next buttons with slide counter
- Slide transitions: `translateX` + `opacity` animation

**SVG guidelines:**
- `font-family: inherit`
- Rounded rectangles (`rx="8"`), circles, polygons for nodes
- `stroke-dasharray` for visual variety in connections
- `viewBox` width 400-500px recommended

### Content Rules
- 1 slide = 1 point (no cramming)
- Max 3 lines of text per slide
- Diagrams are the star, text is support
- Preserve original terminology from source material
- Last slide: links to related slide decks (`<a href="other.html">`)

---

## Integration with pluckmd CLI

These skills work with articles downloaded by `pluckmd download`:

```bash
# Step 1: Download articles
pluckmd download <url> -o ./project/raw

# Step 2: Initialize wiki
# (run wiki init skill)

# Step 3: Ingest articles into wiki
# (run wiki ingest skill, batch by batch)

# Step 4: Generate slides for key concepts
# (run slides skill for each concept)
```

The result is a complete knowledge base with:
- `raw/` — Original articles (immutable)
- `wiki/` — Structured knowledge (concepts, topics, timeline)
- `wiki/slides/` — Visual explanations (interactive HTML)
- `index.md` — Master navigation
- Fully compatible with Obsidian as a vault
