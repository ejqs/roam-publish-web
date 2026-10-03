# Changelog

All notable changes to the Roam Publish extension. Dates are when the change landed on `main`.

## Unreleased

### Commands
- The page and block right-click menus have one entry each, **Roam Publish: Page…** and **Roam Publish: Block…**,
  instead of four. It says whether the page or block is not published, published and up to date, or changed since it
  was last published, with buttons for what you can do: Publish, Republish, Make public / unlisted, Unpublish. It
  refreshes the published list from the server first. **Current page status** / **Focused block status** in the
  command palette show the same.
- Command palette: **Unpublish current page**, **Publish focused block** and **Unpublish focused block** added. **Sync
  published list** and the change log command removed from the palette (Sync stays in settings).
- **Publish current page** publishes the page also when you're zoomed into one of its blocks (it used to publish the
  zoomed block).
- Syncing the published list keeps the author name sent with each item, so it no longer counts as changed.

### Status link and change log
- The link block is now written as **[Roam Publish Status](…/p/…)** under a **[[Roam Publish]]** block, and the change
  log goes directly under it: no separate Changelog block. Pages published before keep their Changelog block and its
  entries; new entries go under the link from the next publish, which also rewrites the bare link.
- New settings: **Status link text** (default `Roam Publish Status`, blank for the bare link). **Roam Publish block
  tag** defaults to `[[Roam Publish]]` for new installs; graphs already set up keep `#published`. Changes to either
  apply to existing blocks in place on the next publish.
- Settings and messages say "status link" and "Roam Publish block" instead of "shortlink", and explain that the link is
  for you and your graph's members, not for sharing.
- The **Roam Publish block tag** and **Status link text** fields no longer show the default in grey when empty, which
  looked like the default would be used. An empty field shows what it does (no tag, bare link).
- **Add Roam Publish block** is now **Add Roam Publish block when publishing pages**, and **Roam Publish block on
  published blocks** is now **Add Roam Publish block when publishing blocks**. The two are independent: turning off
  the pages one no longer turns it off for blocks too.
- Settings: **Get API key** is merged into **Dashboard**, which opens at your API keys until you've added one. **Roam
  Publish block tag** and **position** are now **Block tag** and **Block position**. Shorter descriptions throughout.
- **Reset Roam Publish block settings** puts the Roam Publish block settings back to their defaults. Roam keeps an
  extension's settings after it's uninstalled, so reinstalling brings back the old values.
- **Change log → Open settings** (replaces **Check change log**) opens the graph's change log settings on the
  website, where its owner can see whether it works, manage the token, and turn it off (the token is kept, nothing is
  logged meanwhile) or back on.

## 0.1.0 (2026-10-02)

First release.

### Publishing
- Publish a page or block from the context menu, or the current page from the command palette. The public link is
  copied to your clipboard; publishing again updates the live page, or says nothing changed.
- Unpublish pages and blocks, and sync the list of what you've published from the server.
- New pages and blocks are published **unlisted**. Make them public or unlisted again from the toast or the context
  menu.
- Embeds, view types (numbered, document), text alignment and heading levels are sent. Block references are inlined,
  and references inside code and block-ref aliases are left as written.
- Server moderation messages and reasons are shown when a publish is refused.
- Toast links only open web (http/https) addresses, whatever the server returns.

### Setup and settings
- Paste the API key from the website into **Settings → Roam Publish**. The extension no longer reads your daily
  notes to finish setup.
- **Author name** setting, shown as the byline where the graph or collection shows authors.
- **Open dashboard** button replaces the published list in settings.
- Encrypted graphs are supported.
- Defaults to the `https://roam.pub` server (changeable under **Server URL**).

### Shortlink and change log
- Publishing a page adds a block with its permanent `roam.pub/p/…` shortlink and a **Changelog** block under it,
  where roam.pub records what happens to the page (needs an append-only token).
- Settings: **Add shortlink block**, **Shortlink tag**, **Shortlink position**, and **Shortlink block on published
  blocks** (off by default: only pages get one).
- **Check change log** asks roam.pub whether it can still write to the change log, and warns once per session if Roam
  stopped accepting the token.
- While Roam is open, the extension confirms every few minutes that Changelog blocks still exist (uids only), so
  roam.pub never writes to a deleted block.

### Docs
- README covers setup, usage, settings and what the extension reads, sends and stores.
