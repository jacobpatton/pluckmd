---
description: "Batch download blog articles with harvest CLI. Supports authenticated content on note.com and more."
---

# harvest download — Batch Article Download

Batch save blog/magazine articles as Markdown files using the harvest CLI.

## Usage

```
/harvest-download <URL> [destination]
```

## Steps

### Step 1: Determine if authentication is needed

- Free articles only → Proceed to Step 3
- Paid/authentication required → Proceed to Step 2

### Step 2: Login (first time only)

A browser will open for manual login. Close the browser when done.

```bash
harvest login <site>
```

Supported sites: `note`, `zenn`, `qiita`, `hatena`, `medium`

Sessions are saved in `~/.harvest/chrome-profile/` and not required again.

### Step 3: Run the download

```bash
harvest download <URL> -o <destination> --auth profile
```

| Flag | Description | Default |
|--------|------|-----------|
| `-o, --output <dir>` | Output directory | `./articles` |
| `--auth <mode>` | `auto` / `extension` / `profile` | `auto` |
| `-c, --concurrency <n>` | Concurrency | `2` |
| `--delay <ms>` | Request interval | `500` |
| `--limit <n>` | Max articles | Unlimited |

### Step 4: Verify results

After download completes, check the file count and contents in the output directory.

```bash
ls <destination> | wc -l
head -10 <destination>/*.md
```

## Common Patterns

### All articles from a note.com magazine

```bash
harvest login note
harvest download https://note.com/username/m/magazine_id -o ./articles
```

### All articles from a note.com user

```bash
harvest download https://note.com/username -o ./articles --auth profile
```

### Test with a limited number of articles

```bash
harvest download <URL> --limit 5 -o /tmp/test
```

## Troubleshooting

### SingletonLock error

A previous process is still running. Delete the lock file:

```bash
rm -f ~/.harvest/chrome-profile/SingletonLock
```

### Playwright not installed

```bash
npm install playwright && npx playwright install chromium
```

### Only some articles are fetched

For sites with infinite scroll or "Load more" buttons, use `--auth profile`:

```bash
harvest download <URL> --auth profile -o ./articles
```
