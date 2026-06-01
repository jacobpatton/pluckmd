# Privacy Policy — pluckmd Browser Extension

**Last updated:** 2026-06-01

## What the extension does

The pluckmd Bridge extension connects a locally running pluckmd CLI command to the current browser tab. It sends the rendered HTML of requested pages to a local relay server (`127.0.0.1`) so the CLI can extract article content.

## Data collection

The extension does **not** collect, store, transmit, or sell any personal data. Specifically:

- No analytics or telemetry
- No cookies are read or exported
- No browsing history is recorded
- No data is sent to any remote server

## Host permissions

The extension requests broad host permissions (`http://*/*`, `https://*/*`) because pluckmd is designed to work with arbitrary article sites chosen by the user. These permissions are used **only** to fetch page HTML when the CLI sends an explicit request through the local relay.

## Local relay

All communication happens over a WebSocket connection to `127.0.0.1` (localhost). No data leaves the user's machine. The relay is only active while a pluckmd CLI command is running.

## Third parties

The extension does not integrate with any third-party services, ad networks, or analytics providers.

## Changes

If this policy changes, the update will be posted in this file and the extension version will be incremented.

## Contact

For questions about this policy, open an issue at https://github.com/taisei-ide-0123/pluckmd/issues.
