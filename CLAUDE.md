@AGENTS.md

# Branch workflow

Never commit straight to `main`. For every change: push to `develop` first, wait for the Railway `develop` environment to build and deploy it successfully, then open a PR from `develop` into `main`. Repeat for each later change.
