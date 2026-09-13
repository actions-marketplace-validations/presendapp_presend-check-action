# Presend Dependency Security Check

A GitHub Action that checks your npm dependencies against [Presend](https://presend.pages.dev)'s free API for two real supply-chain risks:

- **Suspicious maintainer changes** -- a package whose publisher changed after a long period of dormancy, the exact pattern behind real attacks like `event-stream`, `ua-parser-js`, and `colors.js`.
- **Known vulnerabilities** -- via [OSV.dev](https://osv.dev).

No signup, no API key, no rate-limit tier walls -- the underlying API is free to call directly too.

## Usage

```yaml
- uses: presendapp/presend-check-action@v1
  with:
    package-json-path: 'package.json'  # optional, defaults to package.json
    checks: 'maintainer,vulnerability'  # optional, defaults to both
    fail-on-issue: 'true'               # optional, set to 'false' to only warn
```

Full example workflow:

```yaml
name: Dependency security check
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: presendapp/presend-check-action@v1
```

## What it does

For each dependency in `dependencies` and `devDependencies`, the action calls Presend's `/maintainer-change-check` and `/vulnerability-check` endpoints and prints a summary. If any package is flagged and `fail-on-issue` is `true` (the default), the workflow step fails.

A flagged maintainer change is a signal for manual review, not proof of compromise -- legitimate maintainer handoffs happen. Read the summary before assuming the worst.

## Currently npm only

Both checks currently support the npm ecosystem only. PyPI and others may be added later.

## Source

This action wraps the public Presend API. Full API docs, source, and the underlying endpoints: [github.com/presendapp/presend](https://github.com/presendapp/presend)
