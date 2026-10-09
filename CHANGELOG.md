# Changelog

User-facing changes to roam.pub, newest first. Each release is a [semantic version](https://semver.org) dated the day
it landed on `main`. The site shows this file, with the extension's, at `/updates`: one bullet is one entry, written
for the people who use the site. Add a bullet with each pull request that changes something they'd notice; leave out
tests, refactors and internal tooling. Start each bullet with its kind: **Breaking:**, **New:**, **Improved:** or
**Fixed:**.

## 0.18.2 (2026-10-09)

### Published pages
- Improved: An encrypted page's badge just says **Encrypted** or **End-to-end encrypted**. Its version is in the
  card that opens from it, with a **Learn more** link.

## 0.18.1 (2026-10-08)

### Site
- Improved: **Upcoming changes** counts an extension as ready for end-to-end encryption only where Roam can
  encrypt pages, and tells you when one of your graphs can't (update Roam's desktop app there).

## 0.18.0 (2026-10-08)

### Security
- New: Password pages can be encrypted in Roam before they're published, so roam.pub never sees their text, not
  even while publishing. This needs extension 0.2.0; earlier versions keep publishing as before.
- New: **Encryption versions.** An encrypted page's badge says **End-to-end encrypted** (v2, encrypted in Roam) or
  **Encrypted** (v1, encrypted by roam.pub when it was published), with the code that did it, and so does its Manage
  dialog. [Encryption versions](/privacy/encryption/versions) explains each one; a v1 page becomes v2 when it's
  republished from extension 0.2.0 or newer.
- Fixed: An encrypted page's badge no longer says roam.pub decrypts it for readers. Readers' browsers do.

### Site
- New: **Upcoming changes** lists changes that will need you to do something, before they happen: what changes,
  what to do, and how many extensions are ready. Signed in, it shows which of your graphs' extensions need an
  update. Find it from What's new.

## 0.17.1 (2026-10-08)

### Dashboard
- Improved: The choice between Discover, Public, Unlisted, Password and Members is called **Visibility** everywhere,
  in the page menu, Manage, bulk changes and the page lists.

### Security
- Fixed: The note under encryption settings no longer says roam.pub decrypts pages to show them. Since 0.16.3,
  readers' browsers do that.

### Site
- Improved: What's new marks breaking changes, ones that need you to do something such as update the extension,
  with a red **Breaking** label, and you can filter to just those.
- Fixed: On phones, What's new no longer runs off the side of the screen on a day with many releases.

## 0.17.0 (2026-10-08)

### Dashboard
- Improved: **One Visibility choice for every page.** Wherever a page is published, it's Discover, Public,
  Unlisted, Password or Members, the same five steps in the page menu, Manage, bulk changes, the filters and the
  bar under each graph. "Listed" is now called Public. Password and Members pages have one checkbox to show their
  title on the front page.
- Improved: **The Sharing tab is only about your pages' visibility.** Bylines, view counts, breadcrumbs, the RSS
  feed and where new pages go moved to a Display section on the graph's Settings tab.

### Publishing
- New: **The Roam extension knows when it's too old for roam.pub.** From extension 0.2.0, it asks you to update in
  Roam Depot when roam.pub has changed in a way it no longer works with, instead of failing.

## 0.16.3 (2026-10-08)

### Security
- Improved: **Encrypted pages are decrypted in your browser.** roam.pub sends them still encrypted and no longer
  reads them to show them. Unlocking sends a proof made from the password instead of the password, and the key
  stays in your browser. You'll enter the password once more on each browser you've unlocked one in.

## 0.16.2 (2026-10-08)

### Dashboard
- Improved: **Listed and Unlisted say what they do to links.** Choosing whether a page is listed now says that
  [[links]] on your other pages only lead to listed pages, and show unlisted ones as plain text. An unlisted
  page's privacy note says the same.

## 0.16.1 (2026-10-08)

### Published pages
- Improved: **Thread lines thicken when you point at them** instead of shading the blocks they fold, so moving the
  mouse across a page no longer flickers.
- Improved: **The page's own thread line stays out of sight** until your pointer is near it.
- Improved: **A quieter outline.** Its hide button shows only while you point at "On this page", and once hidden,
  the button to bring it back fades away as you scroll into the page.
- Improved: Password-protected and members-only pages no longer also say "Not Searchable"; they're never in search
  anyway.

## 0.16.0 (2026-10-08)

### Security
- New: **Add encrypted pages to collections without typing their password.** From the Roam extension they open there
  right away. Added on roam.pub, they open once you republish them from Roam, or right away if you unlocked the page
  in your browser first.

### Site
- Improved: **The encryption rules, in one place.** [Encrypted pages](/privacy/encryption) now says where a page
  can be encrypted, which passwords open it, when you need to type one, and what happens if one is forgotten.

## 0.15.0 (2026-10-08)

### Published pages
- New: **Fold the whole page from its own thread line.** A line now runs beside the page's top-level blocks, like
  the one under any block with children: click it to fold them all, and again to open them.
- New: **Hide the "On this page" outline.** Click the button beside it to tuck it away; it stays hidden on every
  page until you bring it back.

### Publishing
- Fixed: **Make listed** from the Roam extension no longer appears to work on a page that's only in collections. It
  has no graph listing to change, so roam.pub now says each of its collections sets how it's listed.

## 0.14.0 (2026-10-08)

### Published pages
- New: **Mermaid diagrams are drawn.** A `{{mermaid}}` block, or a code block set to Mermaid, now shows the diagram
  instead of "Diagram not shown", with a button to see its source.
- New: **Copy code in one click.** Every code block has a copy button, and its header names the language. Click
  inline code to copy it.

## 0.13.2 (2026-10-08)

### Published pages
- Improved: **Every thread line folds.** Click the line under any block with children: it folds the blocks under
  it, or the block itself when none of them has children of its own.
- Fixed: Zooming into a kanban board, table or embed named it "Untitled" in the trail; it now says what it is.
- Fixed: The fold arrow beside a block disappeared when you moved onto its bullet.

## 0.13.1 (2026-10-08)

### Published pages
- Improved: **Numbered lists zoom too.** Click an item's number to zoom into it, the same as a bullet.
- Improved: **One trail when zoomed in.** The page's trail and the blocks above the one you zoomed into now read as
  a single row, so you can step back to any level, or to the whole page, in one click.

## 0.13.0 (2026-10-08)

### Published pages
- New: **Zoom into any block, like in Roam.** Click a block's bullet to see just that block and what's under it,
  with a trail above it to step back out. The address includes the block, so you can share a link to it.
- New: **Blocks collapsed in Roam can start collapsed on the published page**, when the page is published that way
  from the extension. Readers can open and close them as usual.

## 0.12.0 (2026-10-08)

### Published pages
- New: **Fold blocks away on published pages, like in Roam.** Hover a block that has children and click the arrow
  beside its bullet to collapse it; a folded block's bullet gets a ring, and clicking again opens it. Click the line
  to the left of a block's children to fold or open all of them at once. Find in page still searches folded blocks
  and opens them.
- New: **Pages with headings get an outline.** On wide screens it sits to the left of the page, follows you as you
  scroll and highlights the section you're reading; on phones it's folded above the page. Click a heading to jump
  to it.

## 0.11.0 (2026-10-07)

### Discover
- New: **Collections have their own tab on Discover** (roam.pub/discover/collections), ranked like pages: Recent
  puts the collections with the newest pages first, Trending adds up their pages' views this week, and Top adds up
  their pages' upvotes. Each tile shows a collection's newest pages.
- Improved: **Discover has a cleaner layout that matches front pages**, with a search box and popular tags at the
  top, and the pages in one card with the sort and RSS feed right above them.

## 0.10.0 (2026-10-07)

### Published pages
- New: **Front pages are cards you can browse, not just a table.** A graph's or collection's front page now shows
  its pages as cards with their first lines, tags and date, under a search box and tag chips. Protected
  pages show their lock instead of any text.
- New: **Folders on front pages.** Group the pages on a graph's or collection's front page into folders, up to
  three deep, from the new **Arrange** tab in its dashboard: drag pages in or pick a folder next to each one. Pages
  with Roam namespaces like `PyRevit/…` can be filed in one click, and read without the prefix inside their
  folder. Folders live on the website only, so nothing changes in Roam or the extension.
- New: **Pick each front page's layout** on Arrange: Shelves (folder tiles above the cards), Explorer (a folder
  tree and tags beside them) or List (the table from before, without folders).

### Dashboard
- New: **Take added pages out of their graph** in a collection's settings: pages added from then on, from the
  website or the extension, stop being shown in the graph they came from, so the collection is where they're read
  and they can be encrypted with its password.

### Security
- New: **Decrypt existing pages** in a graph's or collection's settings turns off encryption on every page there
  that one password opens. It shows which pages that password opens and which it skips, such as pages encrypted
  with a different password, before you confirm.
- Improved: **Encrypt existing pages** links each page it leaves readable to that page, with Manage already open,
  so you can set it to Password there. Coming back to settings checks the pages again.

## 0.9.0 (2026-10-07)

### Security
- New: **Encrypt existing pages** in a graph's or collection's settings encrypts the pages already there, not just
  new ones. It first shows how many it will encrypt and which pages stay readable and why, such as being open in
  another place, and asks you to confirm.

### Dashboard
- New: **Settings warn before you lose unsaved changes.** A graph's Settings and Sharing, a collection's settings,
  your profile description and the change log token ask before you follow a link, go Back, reload or close the
  tab with edits you haven't saved. "Unsaved changes" shows next to Save until you do, and Save on a graph's or
  collection's access settings waits until something has changed.
- Improved: **Change who can read existing pages** is the new name for the link that sets access on every page, so
  it's no longer mistaken for encrypting them.

## 0.8.2 (2026-10-07)

### Dashboard
- Improved: **Removing a page from a collection** in Manage asks first, and says when it's the page's last place
  and goes back to your graph as Unlisted.
- Fixed: **Show in graph** in Manage is off-limits when the graph is the only place a page is shown, instead of
  failing after you flip it. Add it to a collection first, or unpublish it.
- Fixed: **Saving a graph's or collection's access settings** waits until they can be saved: a password for
  Password access, at least 10 characters when the password opens encrypted pages, and the current password to
  change it. The reason shows next to Save. A collection also needs a name.
- Fixed: **A page's own password** can't be changed to one too short to encrypt with on an encrypted page, and
  **Remove it** no longer shows when there's no graph or collection password to fall back on.
- Improved: **Revoke** on API keys, **Remove token** for the Roam change log, **Claim** for a username and
  **Decline** on an invite each ask before doing something you can't take back from there.

### Security
- Fixed: **Encrypt new password pages** in a graph's or collection's settings only turns on with a password it can
  encrypt with. Turning it on asks you to confirm what encrypting changes, and asks for a password of at least 10
  characters when there isn't one yet. Before, it could be switched on without either.

## 0.8.1 (2026-10-06)

### Publishing
- Fixed: **An API key pasted into the wrong graph** no longer publishes that graph's pages under another graph's
  name. Publishing says which graph the key is for and where to get the right one. Needs the next extension
  release.
- Fixed: **Make listed** in the extension no longer says a page is on your graph's front page when the front page
  is turned off. It says nothing lists the page yet and where to turn the front page on.

### Published pages
- Fixed: **Links between pages** only lead to listed pages. A link to an unlisted page shows as plain text, so its
  address isn't handed to everyone who reads the page linking to it.

## 0.8.0 (2026-10-06)

### Site
- New: **Terms and Privacy changes** are announced on the site: when either changes, signed-in people see
  a notice for two weeks that links to it, which they can dismiss.
- Fixed: **Terms and Privacy** show when each was really last changed. The "Last updated" date comes from
  the site's history, so it no longer lags behind edits.

## 0.7.6 (2026-10-06)

### Site
- Improved: **Privacy policy** says what happens to emails you send to roam.pub, such as a reply to a moderation
  notice: Resend keeps them, and roam.pub's admins read them and may write back.

## 0.7.5 (2026-10-06)

### Site
- Improved: **Emails** from roam.pub, such as verification, password reset, invites and moderation notices,
  have a proper design: what happened, one button for what to do next, and the link written out under it in
  case the button doesn't work.

## 0.7.4 (2026-10-06)

### Publishing
- Fixed: **Graph setup** refuses names roam.pub uses for its own pages, such as admin, updates or costs,
  since a graph with one of them could never show its front page. The form says so as you type.

## 0.7.3 (2026-10-05)

### Security
- Fixed: **Moderation pages** could be read without an admin account, which would have exposed account emails
  and reports. Each one now checks who's asking. There were no users on the website yet for this vulnerability
  to be taken advantage of.

### Site
- Fixed: **What's new** no longer lists a change again at the top when its wording is corrected after release.
  It keeps its place with the rest of its version.

## 0.7.2 (2026-10-05)

### Dashboard
- Improved: **Members** of a graph or collection see each other by name. Only the owner, who invites by
  email, sees everyone's email address.

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
