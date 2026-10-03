@AGENTS.md

# Branch workflow

Never commit straight to `main`. For every change: push to `develop` first, wait for the Railway `staging` environment (shadow database, project `roam-publish`) to deploy it successfully. Its pre-deploy step runs the tests against the shadow DB, so a SUCCESS deploy means they passed. Never open the PR if the staging deploy failed, then open a PR from `develop` into `main`. Repeat for each later change.
