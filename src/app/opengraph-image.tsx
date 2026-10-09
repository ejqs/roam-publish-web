import { renderSiteCard } from "@/lib/og/render";

/** The link preview for pages without their own (published pages and collections draw theirs). */
export const alt = "Roam Publish: publish Roam Research pages and blocks to the web.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderSiteCard();
}
