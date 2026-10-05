# Changelog

User-facing changes to roam.pub, newest first. Each release is a [semantic version](https://semver.org) dated the day
it landed on `main`. The site shows this file, with the extension's, at `/updates`: one bullet is one entry, written
for the people who use the site. Add a bullet with each pull request that changes something they'd notice; leave out
tests, refactors and internal tooling. Start each bullet with its kind: **New:**, **Improved:** or **Fixed:**.

## 0.7.1 (2026-10-05)

### Dashboard
- Improved: **RSS feed** shows as off and can't be changed while a graph's front page or a collection's page is
  locked, since the feed only works while anyone can open it. Unlocking brings back what you had.

## 0.7.0 (2026-10-05)

### Dashboard
- New: **Encrypt new password pages** in a graph's or collection's access settings stores pages added from now on
  encrypted with its password, so not even roam.pub can read them. It needs a password of at least 10 characters.
- Improved: **Search engines** and **Listed pages in site search** show as off and can't be changed while a graph's
  front page or a collection's page is locked. Unlocking brings back what you had.

## 0.6.2 (2026-10-05)

### Dashboard
- Improved: **Show in roam.pub search** in a page's Manage dialog is off and can't be turned on in a place where
  search can't show the page, such as a password-protected collection.

## 0.6.1 (2026-10-05)

### Dashboard
- Fixed: **Show in roam.pub search** in a page's Manage dialog no longer says people can find the page through a
  place where search can't reach it, such as a password-protected collection. It says why instead.

## 0.6.0 (2026-10-05)

### Published pages
- New: A page's status link has a **Manage** button on each place it's in that you can manage, opening that graph's
  or collection's dashboard at the page.

## 0.5.0 (2026-10-04)

### Site
- New: The website has version numbers, like the extension. What's new shows which version each change came in,
  and the footer shows the current one.
- New: What's new tags each change as **New**, **Improved** or **Fixed**, and you can show just one kind.
- Improved: What's new shows when each change went live, and marks only what's new since your last visit instead of
  everything from that day. Extension changes appear once Roam Depot serves them, not before.

## 0.4.0 (2026-10-04)

### Dashboard
- Improved: Password protection shows as a lock everywhere, and an encrypted page shows the lock with an **E** beside
  it.
- Improved: A page's **Manage** dialog lists each place it's published as one row, with an icon for a graph or a
  collection and what the page uses there. Open a row to change it.
- Improved: Access control and Visibility control mark the graph's or collection's default choice.
- Improved: **Listed** has a document icon, so the globe only means **Anyone**.
- Improved: Choosing a password and encrypting the page now sit under **Password**, in the place you're changing.
- Improved: When **Discoverable** can't be chosen, the reason is always shown under it.
- Improved: Pages say **Unlisted** instead of "Not listed", and the dashboard menu shows both settings, as in "Anyone
  · Listed".
- Improved: The graph's **Defaults** tab is now **Sharing**, and holds the front page, search engines, Discoverable,
  RSS and breadcrumb settings that used to be under Settings.
- New: Turn off **Listed pages in site search** in a graph's Sharing tab or a collection's settings to keep its listed
  pages out of roam.pub search. Discoverable pages are always searchable.
- New: Turn off **Show in roam.pub search** in a page's Manage dialog to keep just that page out of search. Where it's
  Listed it then shows as **Listed (Not Searchable)**, and readers see a **Not Searchable** badge by its title.
  Discoverable pages are always searchable.
- Improved: **Show in roam.pub search** now sits under Visibility control in each place of a page's Manage dialog, and
  follows the listing you choose: Unlisted turns it off, Listed turns it on, and Discoverable keeps it on and locked.
- Fixed: The graph setting **New pages are Discoverable when listed** is gone. New pages start unlisted, and you
  choose **Listed** or **Discoverable** for each page when you list it, so the setting never took effect.

### Publishing
- Improved: The change log under a page's status link groups entries under one `[[date]]` block per day, each line
  showing just the time.
- Improved: Changes to a setting made within 5 minutes of each other are logged once, with where it ended up, and not
  at all if it ended where the change log already showed it. Entries reach Roam about 5 minutes after the last change.
  Each page's history on its status page still lists every change.
- New: Choose what goes into the change log in the graph's settings: publishing, who can read, where it's listed,
  collections and tags. Merging quick changes and grouping by day can be turned off there too.
- New: The Roam extension can make a page **Discoverable**, not just Listed or Unlisted (with its next version). When
  a page can't be Discoverable, the extension says why.
- Fixed: Choosing **Discoverable** for a page is refused while the graph's front page or search engines are off, with
  the reason, instead of saving a setting that had no effect.

### Published pages
- Fixed: A block with several embeds shows all of them, not just the first (with the next version of the Roam
  extension).
- Fixed: A Roam Publish status link pasted under an ordinary block no longer hides that block and everything under it
  from the published page; only the link itself is left out (also with the next version of the Roam extension).
- Fixed: A page or block shown as a Document or Numbered list in Roam now shows its nested blocks the same way,
  instead of switching back to bullets below the first level.
- Improved: View counts on pages getting a rush of readers now catch up within about 15 minutes, while counts that
  aren't moving refresh less often.

### Site
- New: You can now reach us at support@roam.pub.

## 0.3.0 (2026-10-03)

### Announcements
- New: **What's new** at `/updates` lists changes to the website and the Roam extension in one timeline, with an RSS
  feed. A small dot next to the What's new link means there's something you haven't seen.
- New: A banner above every page for urgent news: downtime, an outage, or something you need to act on. It appears on
  its own when publishing, sign-in, published pages, the dashboard, the change log to Roam or emails run into trouble,
  and goes away when that's fixed.

### Dashboard
- New: Shift-click selects a range of pages, and the selection bar can unpublish them all at once.
- Improved: Moving a page onto or off Discover asks first.
- Improved: New header for dashboard, graph and collection pages, with the API keys, Invites and Settings tabs in one
  row.
- Improved: Page access is set with inline choices instead of a menu.
- Improved: Graph settings are split: access defaults for new pages have their own **Defaults** tab.
- Improved: The access settings are now called **Access control** (who can open a page) and **Visibility control**
  (where it's listed).
- Improved: Each privacy setting has its own icon everywhere: an eye crossed out for unlisted, a key for a password, a
  keyhole lock for encrypted and people for members only.

### Published pages
- New: Links to a published page now unfold into a full preview in chat apps and social feeds: its title, the first
  lines of its text, its author, a tag and reading time, and a card drawing the page with the pages it links to.
  Password-protected, members-only and encrypted pages only show their graph or collection.
- New: A page that's unlisted, password-protected, encrypted or members-only says so next to its title, and explains
  what that means when you hover or tap it.
- New: Published pages show their view count, synced from our analytics. Members-only pages don't.
- New: Links to pages that aren't published are marked.
- Fixed: Outline bullets line up with the first line of text at any font size.

### Discover
- Improved: Redesigned with excerpts, a sidebar and quieter votes. Upvoting is a button when you can, a count when you
  can't.

### Site
- New: Privacy policy and terms pages, each linking to its change history on GitHub.
- Improved: The privacy policy now lists every cookie, embedded media from other sites, where data is stored, why it's
  used, how long it's kept, when it's disclosed, security and your rights. The terms add a liability limit, Philippine
  law, and the extension's license.
- Improved: The privacy policy is reorganised and shorter: a summary at the top, each fact said once, and everything
  about how long data is kept in one section.
- New: A costs page explaining what running the site costs and when a small fee might come.
- New: Footer: source code for the website, the extension and the docs in one popup.

### Security
- New: A page that uses Password everywhere it's published can be encrypted with its passwords (**Manage →
  Encryption**), so the database holds no readable copy. It isn't end-to-end: roam.pub decrypts it to show it to
  readers. [How encrypted pages work](/privacy/encryption).
- Improved: Published pages can still be embedded in Roam, Notion or a blog; account pages can't be framed.
- Fixed: Front-page search no longer reveals text from protected pages.
- Improved: IP addresses used for rate limits are cleared from memory once the limit ends, and the hashes of
  reporters' IP addresses (and emails, after an account is deleted) can no longer be reversed.

## 0.2.0 (2026-10-02)

### Publishing
- New: Permanent status links and a change log written back into Roam under each published page. Owners can pause it
  or opt out when connecting a graph.
- New: Each page's history is shown on its status page.

### Graphs and collections
- New: Shared graphs, account-wide API keys, collections and access per graph, collection or page, with one vocabulary
  for access everywhere.
- New: Tags, search and list filters on graph and collection pages; tags can be edited on the website.
- New: RSS feeds for graphs, collections and Discover.
- New: Bulk changes to listing, access and tags for selected pages on the dashboard.
- New: Owners can delete graphs and their account.

### Discover
- New: Shown as a ranked feed with upvotes.

### Site
- New: Light, dark and system themes from the top-right corner.

## 0.1.0 (2026-10-01)

### Published pages
- New: Tables, boards and embeds drawn in place like in Roam, with inline math, PDFs and iframes.
