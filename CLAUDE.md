@AGENTS.md

# Branch workflow

Never commit straight to `main`. For every change: push to `develop` first, wait for the Railway `staging` environment (shadow database, project `roam-publish`) to deploy it successfully. Its pre-deploy step runs the tests against the shadow DB, so a SUCCESS deploy means they passed. Never open the PR if the staging deploy failed, then open a PR from `develop` into `main`. Repeat for each later change.

# Changelog

`CHANGELOG.md` is what users see at `/updates` (What's new); nothing there is generated from commits. Every change users would notice adds a bullet in the same commit: under `## YYYY-MM-DD` for the day it reaches `main` (add the heading if it isn't there), then a `### Area` (reuse one: Dashboard, Published pages, Publishing, Discover, Security, Site…). Start each bullet with its kind: `New:` (something you couldn't do before), `Improved:` (works better or reads clearer) or `Fixed:` (was broken); a test fails a bullet without one. /updates stamps each entry with when the deploy carrying it first started, so it says exactly what a reader missed. Write for the people who use the site, one change per bullet, wrapped lines indented. Leave out tests, refactors, internal tooling and fixes too small to notice. The Changelog check fails a PR into `main` that changes `src/`, `public/` or `drizzle/` without touching `CHANGELOG.md`; label it `no-changelog` when there's genuinely nothing to log.
