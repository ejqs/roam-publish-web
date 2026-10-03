"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bulletClass, childrenClass, rowClass } from "@/components/roam/outline";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type TrendingRow = { key: string; href: string; title: string; source: string };

const SWAP_MS = 4000;
const FADE_MS = 250;

function Bullet() {
  return <span aria-hidden className={bulletClass} />;
}

/**
 * Shows one trending page at a time and cycles through the pool. The server render is the first
 * page, so nothing flashes in; cycling pauses while the pointer or focus is on the row.
 */
export function TrendingPages({ rows }: { rows: TrendingRow[] }) {
  const [start, setStart] = useState(0);
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);
  const cycles = rows.length > 1;

  useEffect(() => {
    if (!cycles || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let swap: ReturnType<typeof setTimeout>;
    const timer = setTimeout(
      function tick() {
        setFading(true);
        swap = setTimeout(() => {
          setStart((s) => (s + 1) % rows.length);
          setFading(false);
        }, FADE_MS);
      },
      SWAP_MS,
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(swap);
    };
  }, [cycles, paused, rows.length, start]);

  const current = rows[start % Math.max(rows.length, 1)];

  return (
    <li className={rowClass}>
      <Bullet />
      <div className="py-0.5 leading-[1.6]">
        Trending pages on{" "}
        <Link href="/discover" className="text-link hover:underline">
          Discover
        </Link>
        <Popover>
          <PopoverTrigger
            openOnHover
            delay={100}
            aria-label="About discovery"
            className="ml-0.5 cursor-help align-super text-[0.8em] leading-none text-muted-foreground hover:text-foreground"
          >
            *
          </PopoverTrigger>
          <PopoverContent side="top" className="w-64">
            Discovery is opt-in. Pages only show up here if their owner turns it on for their graph; otherwise they&apos;re
            reachable only by link.
          </PopoverContent>
        </Popover>
      </div>
      {!current ? (
        <ul className={cn("flex flex-col", childrenClass)}>
          <li className={rowClass}>
            <Bullet />
            <div className="py-0.5 leading-[1.6] text-muted-foreground">Nothing here yet.</div>
          </li>
        </ul>
      ) : (
        <ul
          className={cn("flex flex-col transition-opacity duration-200 data-[fading=true]:opacity-0", childrenClass)}
          data-fading={fading}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <li className={rowClass}>
            <Bullet />
            <div className="py-0.5 leading-[1.6] break-words">
              <Link href={current.href} className="text-link hover:underline">
                {current.title}
              </Link>{" "}
              <span className="text-muted-foreground">in {current.source}</span>
            </div>
          </li>
        </ul>
      )}
    </li>
  );
}
