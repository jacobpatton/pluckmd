# pluckmd Skills

AI agent skills for building a knowledge base from articles fetched with pluckmd.

## Claude Code

Copy or symlink the files in `skills/claude-code/` to `~/.claude/commands/`:

```bash
ln -s $(pwd)/skills/claude-code/pluckmd-wiki.md ~/.claude/commands/pluckmd-wiki.md
ln -s $(pwd)/skills/claude-code/pluckmd-slides.md ~/.claude/commands/pluckmd-slides.md
```

Usage:
```
/pluckmd-wiki init ./my-project
/pluckmd-wiki ingest --batch 10
/pluckmd-slides wiki/concepts/agility
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
| **pluckmd-wiki** | LLM Wiki build & management | `/pluckmd-wiki` | `wiki` section in `AGENTS.md` |
| **pluckmd-slides** | HTML slide generation | `/pluckmd-slides` | `slides` section in `AGENTS.md` |
