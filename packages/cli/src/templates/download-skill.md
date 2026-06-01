---
description: "Batch download blog articles with pluckmd CLI using generic runtime extraction."
---

# pluckmd download

Batch save blog/magazine articles as Markdown using the pluckmd CLI.

Usage: `/pluckmd-download <URL> [destination]`

## Login (if authentication is required, first time only)
```bash
pluckmd login <login-url>
```

## Download
```bash
pluckmd download <URL> -o <destination>
```

Flags: `-o` (output dir), `-c` (concurrency), `--delay` (interval in ms), `--limit` (max count, default 100), `--pagination-timeout` (listing collection timeout in ms, default 300000), `--active-tab` (use current Chrome tab via extension)

## Troubleshooting
- SingletonLock: `rm -f ~/.pluckmd/chrome-profile/SingletonLock`
- Playwright: `npm install playwright && npx playwright install chromium`
- Only partial results: try `--active-tab` with the page open in Chrome, increase `--limit`, or increase `--pagination-timeout`
