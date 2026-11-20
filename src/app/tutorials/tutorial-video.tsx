"use client";

import { PlayIcon } from "lucide-react";
import { useRef, useState } from "react";

/**
 * A tutorial's clip: its poster (the end result) with a play button, and the browser's own controls
 * once it plays. Nothing is downloaded until then. MP4 first for Safari, WebM for browsers without H.264.
 */
export function TutorialVideo({ id, title }: { id: string; title: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const play = () => {
    setStarted(true);
    void ref.current?.play().catch(() => {});
  };
  return (
    <div className="relative border-b bg-muted">
      <video
        ref={ref}
        className="block aspect-video w-full"
        poster={`/tutorials/${id}.jpg`}
        controls={started}
        muted
        loop
        playsInline
        preload="none"
        aria-label={`${title}: video`}
      >
        <source src={`/tutorials/${id}.mp4`} type="video/mp4" />
        <source src={`/tutorials/${id}.webm`} type="video/webm" />
      </video>
      {!started && (
        <button
          type="button"
          onClick={play}
          aria-label={`Play: ${title}`}
          className="group absolute inset-0 flex items-center justify-center bg-foreground/0 transition-colors hover:bg-foreground/5 focus-visible:outline-none"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
            <PlayIcon className="ml-0.5 size-5 fill-current" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );
}
