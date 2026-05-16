# harvest Skills

AI agent skills for building a knowledge base from articles fetched with harvest.

## Claude Code

Copy or symlink the files in `skills/claude-code/` to `~/.claude/commands/`:

```bash
ln -s $(pwd)/skills/claude-code/harvest-wiki.md ~/.claude/commands/harvest-wiki.md
ln -s $(pwd)/skills/claude-code/harvest-slides.md ~/.claude/commands/harvest-slides.md
```

Usage:
```
/harvest-wiki init ./my-project
/harvest-wiki ingest --batch 10
/harvest-slides wiki/concepts/agility
```

## Codex / Cursor / Windsurf / Other Agents

Copy `skills/agents/AGENTS.md` to your project root:

```bash
cp skills/agents/AGENTS.md ./my-project/AGENTS.md
```

Agents will automatically read this file and can execute skills such as `wiki init`, `wiki ingest`, `slides`, etc.

## Skill List

| Skill | Function | Claude Code | General Agents |
|--------|------|-------------|-----------------|
| **harvest-wiki** | LLM Wiki build & management | `/harvest-wiki` | `wiki` section in `AGENTS.md` |
| **harvest-slides** | HTML slide generation | `/harvest-slides` | `slides` section in `AGENTS.md` |
