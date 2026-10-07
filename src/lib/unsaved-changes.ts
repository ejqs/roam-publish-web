import { useEffect, useId } from "react";
import { stableStringify } from "./stable-stringify";

/**
 * Settings forms with a Save button warn before their edits are lost: closing or reloading the tab
 * (the browser's own prompt), following a link anywhere on the page, or going Back. Several forms on
 * one page share one warning, so leaving asks once.
 */
export const LEAVE_MESSAGE = "You have unsaved changes. Leave without saving them?";

/** Whether two settings snapshots differ. Key order and undefined fields don't count. */
export function changed(a: unknown, b: unknown) {
  return stableStringify(a) !== stableStringify(b);
}

type Link = { href: string; target?: string; download?: boolean };
type Click = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };

/** Whether following this link in this tab replaces the page the form is on. The same page, or a #hash on it, doesn't. */
export function linkLeavesPage(link: Link, click: Click, current: string) {
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (link.download || (link.target && link.target !== "_self")) return false;
  const to = new URL(link.href, current);
  if (to.protocol !== "http:" && to.protocol !== "https:") return false;
  const from = new URL(current);
  return to.origin !== from.origin || to.pathname !== from.pathname || to.search !== from.search;
}

const dirty = new Set<string>();
/** Set while the reader has already said yes, so a follow-up check doesn't ask again. */
let leaving = false;

function stay() {
  if (!dirty.size || leaving) return false;
  if (window.confirm(LEAVE_MESSAGE)) {
    leaving = true;
    setTimeout(() => (leaving = false), 1000);
    return false;
  }
  return true;
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.size || leaving) return;
  e.preventDefault();
  // Older browsers only prompt when this is set.
  e.returnValue = "";
}

// Runs before Next's <Link> handler, which never sees a click the reader cancelled.
function onClick(e: MouseEvent) {
  if (e.defaultPrevented || !(e.target instanceof Element)) return;
  const a = e.target.closest("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return;
  if (!linkLeavesPage({ href: a.href, target: a.target, download: a.hasAttribute("download") }, e, location.href)) return;
  if (!stay()) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}

type NavigateEvent = Event & { navigationType: string; cancelable: boolean; hashChange: boolean };
type Navigation = EventTarget;

// Back and Forward, where the browser lets a page cancel them (the Navigation API).
function onNavigate(e: Event) {
  const nav = e as NavigateEvent;
  if (nav.navigationType !== "traverse" || !nav.cancelable || nav.hashChange) return;
  if (stay()) nav.preventDefault();
}

function navigation() {
  return (window as unknown as { navigation?: Navigation }).navigation;
}

function listen(on: boolean) {
  if (on) {
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    navigation()?.addEventListener("navigate", onNavigate);
  } else {
    window.removeEventListener("beforeunload", onBeforeUnload);
    document.removeEventListener("click", onClick, true);
    navigation()?.removeEventListener("navigate", onNavigate);
  }
}

/** Warns before leaving while `isDirty`. Call it in each settings form, with whether it has edits not yet saved. */
export function useUnsavedChanges(isDirty: boolean) {
  const id = useId();
  useEffect(() => {
    if (!isDirty) return;
    if (!dirty.size) listen(true);
    dirty.add(id);
    return () => {
      dirty.delete(id);
      if (!dirty.size) listen(false);
    };
  }, [id, isDirty]);
}
