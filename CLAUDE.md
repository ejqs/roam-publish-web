@AGENTS.md

# Branch workflow

Never commit straight to `main`. For every change: push to `develop` first, wait for CI (typecheck, lint, tests, `bun run build`) to succeed, then open a PR from `develop` into `main`. Repeat for each later change.
