# Security Policy

## Supported Versions

harvest is pre-1.0 software. Security fixes are applied to the main branch and
the latest published package when publishing is available.

## Reporting a Vulnerability

Please report vulnerabilities through GitHub issues if the report does not
include sensitive details. For sensitive reports, contact the repository owner
privately before publishing details.

## Local Browser Bridge

The Chrome extension connects to a local relay started by the CLI on
`127.0.0.1`. The relay should never be exposed to a public network. The
extension may access arbitrary hosts because harvest is designed to work with
unknown article sites, but it only returns page HTML in response to local CLI
requests while the relay is running.

For stricter local setups, set `HARVEST_EXTENSION_ID` to the installed Chrome
extension ID. The relay will then reject WebSocket connections from other
Chrome extensions unless they also provide the fallback token.

Do not use harvest to access, copy, or redistribute content unless you have the
right to do so.
