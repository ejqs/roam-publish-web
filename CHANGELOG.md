# Changelog

User-facing changes to roam.pub, newest first. Dates are when the change landed on `main`. The site shows this
file, with the extension's, at `/updates`: one bullet is one entry, written for the people who use the site. Add a
bullet with each pull request that changes something they'd notice; leave out tests, refactors and internal tooling.

## 2026-10-04

### Dashboard
- A page's **Manage** dialog lists each place it's published as one row, with an icon for a graph or a collection, what
  it uses there, and what the graph or collection starts pages as. Open a row to change it.
- Access control and Visibility control mark the graph's or collection's default choice.
- Choosing a password and encrypting the page now sit under **Password**, in the place you're changing.
- When **Discoverable** can't be chosen, the reason is always shown under it.
- Pages say **Unlisted** instead of "Not listed", and the dashboard menu shows both settings, as in
  "Anyone · Listed".
- The graph's **Defaults** tab is now **Sharing**, and holds the front page, search engines, Discoverable, RSS and
  breadcrumb settings that used to be under Settings.

## 2026-10-03

### Announcements
- **What's new** at `/updates` lists changes to the website and the Roam extension in one timeline, with an RSS feed. A
  small dot next to the What's new link means there's something you haven't seen.
- A banner above every page for urgent news: downtime, an outage, or something you need to act on. It appears on its
  own when publishing, sign-in, published pages, the dashboard, the change log to Roam or emails run into trouble, and
  goes away when that's fixed.

### Dashboard
- Shift-click selects a range of pages, and the selection bar can unpublish them all at once.
- Moving a page onto or off Discover asks first.
- New header for dashboard, graph and collection pages, with the API keys, Invites and Settings tabs in one row.
- Page access is set with inline choices instead of a menu.
- Graph settings are split: access defaults for new pages have their own **Defaults** tab.
- The access settings are now called **Access control** (who can open a page) and **Visibility control** (where it's
  listed).
- Each privacy setting has its own icon everywhere: an eye crossed out for unlisted, a key for a password, a keyhole
  lock for encrypted and people for members only.

### Published pages
- Links to a published page now unfold into a full preview in chat apps and social feeds: its title, the first lines
  of its text, its author, a tag and reading time, and a card drawing the page with the pages it links to.
  Password-protected, members-only and encrypted pages only show their graph or collection.
- A page that's unlisted, password-protected, encrypted or members-only says so next to its title, and explains what
  that means when you hover or tap it.
- Published pages show their view count, synced from our analytics. Members-only pages don't.
- Links to pages that aren't published are marked.
- Outline bullets line up with the first line of text at any font size.

### Discover
- Redesigned with excerpts, a sidebar and quieter votes. Upvoting is a button when you can, a count when you can't.

### Site
- Privacy policy and terms pages, each linking to its change history on GitHub.
- The privacy policy now lists every cookie, embedded media from other sites, where data is stored, why it's used, how
  long it's kept, when it's disclosed, security and your rights. The terms add a liability limit, Philippine law, and the extension's license.
- The privacy policy is reorganised and shorter: a summary at the top, each fact said once, and everything about how
  long data is kept in one section.
- A costs page explaining what running the site costs and when a small fee might come.
- Footer: source code for the website, the extension and the docs in one popup.

### Security
- A page that uses Password everywhere it's published can be encrypted with its passwords (**Manage → Encryption**),
  so the database holds no readable copy. It isn't end-to-end: roam.pub decrypts it to show it to readers.
  [How encrypted pages work](/privacy/encryption).
- Published pages can still be embedded in Roam, Notion or a blog; account pages can't be framed.
- Front-page search no longer reveals text from protected pages.
- IP addresses used for rate limits are cleared from memory once the limit ends, and the hashes of reporters' IP
  addresses (and emails, after an account is deleted) can no longer be reversed.

## 2026-10-02

### Publishing
- Permanent status links and a change log written back into Roam under each published page. Owners can pause it or
  opt out when connecting a graph.
- Each page's history is shown on its status page.

### Graphs and collections
- Shared graphs, account-wide API keys, collections and access per graph, collection or page, with one vocabulary for
  access everywhere.
- Tags, search and list filters on graph and collection pages; tags can be edited on the website.
- RSS feeds for graphs, collections and Discover.
- Bulk changes to listing, access and tags for selected pages on the dashboard.
- Owners can delete graphs and their account.

### Discover
- Shown as a ranked feed with upvotes.

### Site
- Light, dark and system themes from the top-right corner.

## 2026-10-01

### Published pages
- Tables, boards and embeds drawn in place like in Roam, with inline math, PDFs and iframes.
