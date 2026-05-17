---
description: "Batch download blog articles with harvest CLI. Supports authenticated content on note.com and more."
---

# harvest download

Batch save blog/magazine articles as Markdown using the harvest CLI.

Usage: `/harvest-download <URL> [destination]`

## Login (if authentication is required, first time only)
```bash
harvest login <site>   # note, zenn, qiita, hatena, medium
```

## Download
```bash
harvest download <URL> -o <destination> --auth profile
```

Flags: `-o` (output dir), `--auth` (auto/extension/profile), `-c` (concurrency), `--delay` (interval in ms), `--limit` (max count, default 100), `--pagination-timeout` (listing collection timeout in ms, default 300000)

## Troubleshooting
- SingletonLock: `rm -f ~/.harvest/chrome-profile/SingletonLock`
- Playwright: `npm install playwright && npx playwright install chromium`
- Only partial results: use `--auth profile`
