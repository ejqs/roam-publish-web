/**
 * The tutorials at /tutorials: one per main feature, each a short silent clip with its steps written out,
 * so the page is useful before (or without) the video. Clips are recorded by script and served from
 * public/tutorials/{id}.mp4 and .webm with a {id}.jpg poster (scripts/tutorial-videos); a tutorial without `video` shows a placeholder.
 */

export type TutorialSource = "web" | "ext";

export type Tutorial = {
  /** Its anchor (/tutorials#publish) and the clip's file name. */
  id: string;
  title: string;
  summary: string;
  /** Where it happens: in Roam (the extension), on roam.pub, or both. */
  where: TutorialSource[];
  /** Roam markup is not parsed: **bold** only, for the names of buttons and settings. */
  steps: string[];
  /** Set once public/tutorials/{id}.mp4, .webm and .jpg exist. */
  video?: boolean;
};

export const TUTORIALS: Tutorial[] = [
  {
    id: "setup",
    video: true,
    title: "Set up Roam Publish",
    summary: "Connect your graph to roam.pub and add your API key to the extension.",
    where: ["web", "ext"],
    steps: [
      "Sign up on roam.pub and connect your graph with an append-only API token (Roam: **Settings → Graph → API tokens**).",
      "Install **Roam Publish** from Roam Depot.",
      "In Roam, open **Settings → Roam Publish**, click **Open dashboard**, copy your key and paste it into **API key**.",
    ],
  },
  {
    id: "publish",
    video: true,
    title: "Publish a page or block",
    summary: "Publish from Roam and get a link to share.",
    where: ["ext"],
    steps: [
      "Right-click a page title or bullet and choose **Roam Publish: Page…** or **Roam Publish: Block…** from the menu.",
      "Pick where it goes and its visibility.",
      "Click **Publish page**. The link is copied to your clipboard.",
      "After you edit it in Roam, click **Republish** in the same menu.",
    ],
  },
  {
    id: "visibility",
    video: true,
    title: "Choose its visibility",
    summary: "Unlisted, Public or Discover.",
    where: ["ext", "web"],
    steps: [
      "**Unlisted:** only people with the link can open it. New pages start here.",
      "**Public:** listed on your graph's front page and in roam.pub search.",
      "**Discover:** also listed on roam.pub's Discover, where readers find and upvote pages.",
      "Change it from the settings icon after the page's title in Roam, or from your dashboard.",
    ],
  },
  {
    id: "password",
    video: true,
    title: "Lock a page with a password",
    summary: "Password or members-only pages, end-to-end encrypted with a password of 10 or more characters.",
    where: ["web", "ext"],
    steps: [
      "On your dashboard, set the page's visibility to **Password** and enter a password, or to **Members** for people you invite.",
      "With a password of 10 or more characters, publish to **Graph (Password, encrypted)** in Roam. The page is encrypted before it leaves Roam.",
      "Readers enter the password once. Unlocking lasts 30 days on that browser.",
    ],
  },
  {
    id: "collections",
    video: true,
    title: "Gather pages in a collection",
    summary: "One place for pages from different graphs and people.",
    where: ["web", "ext"],
    steps: [
      "On your dashboard, click **Add collection**. Invite people to add their pages.",
      "In Roam, choose **Add to collection…** on a published page, or publish straight to the collection.",
      "Each page takes the collection's own access and visibility settings there.",
    ],
  },
  {
    id: "status",
    video: true,
    title: "See status and stats in Roam",
    summary: "Every published page shows its status, views and settings after its title.",
    where: ["ext"],
    steps: [
      "The status icon is green when the page is up to date, and orange with a dot when it changed since you last published it.",
      "The stats icon shows views, upvotes and readers' countries.",
      "The globe in Roam's top bar opens your dashboard: views per day, most read pages and pages changed since publishing.",
    ],
  },
  {
    id: "pdf",
    video: true,
    title: "Let readers download a PDF",
    summary: "Readers save the page as a PDF, when you turn it on.",
    where: ["ext", "web"],
    steps: [
      "Open the page's settings, in Roam or on your dashboard, and turn on **PDF download**.",
      "Readers get a **Download PDF** button on the page.",
    ],
  },
];

export const TUTORIAL_SOURCE_LABEL: Record<TutorialSource, string> = { ext: "In Roam", web: "On roam.pub" };
