---
description: "Batch download blog articles with pluckmd CLI using generic runtime extraction."
---

# pluckmd download — Batch Article Download

Batch save blog/magazine articles as Markdown files using the pluckmd CLI.

## Usage

```
/pluckmd-download <URL> [destination]
```

## Steps

### Step 1: Determine if authentication is needed

- Free articles only → Proceed to Step 3
- Paid/authentication required → Proceed to Step 2

### Step 2: Login (first time only)

A browser will open for manual login. Close the browser when done.

```bash
pluckmd login <login-url>
```

Sessions are saved in `~/.pluckmd/chrome-profile/` and not required again.

### Step 3: Run the download

```bash
pluckmd download <URL> -o <destination>
```

| Flag | Description | Default |
|--------|------|-----------|
| `-o, --output <dir>` | Output directory | `./articles` |
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

### Listing page

```bash
pluckmd download <URL> -o ./articles
```

### Test with a limited number of articles

```bash
pluckmd download <URL> --limit 5 -o /tmp/test
```

## Troubleshooting

### SingletonLock error

A previous process is still running. Delete the lock file:

```bash
rm -f ~/.pluckmd/chrome-profile/SingletonLock
```

### Playwright not installed

```bash
npm install playwright && npx playwright install chromium
```

### Only some articles are fetched

For sites with infinite scroll or "Load more" buttons, open the page in Chrome
with the pluckmd extension installed and use:

```bash
pluckmd download --active-tab -o ./articles
```
