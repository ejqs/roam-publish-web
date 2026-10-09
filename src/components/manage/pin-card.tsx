"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Pin, PinTarget } from "@/lib/pin-rules";
import { PinControl } from "./pin-control";

/** A front page's or collection page's own link, with its pin, at the top of its Sharing settings. */
export function PinCard({
  title,
  path,
  target,
  pin,
  blocks,
}: {
  title: string;
  path: string;
  target: PinTarget;
  pin: Pin | null;
  blocks: string;
}) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          <a href={path} className="break-all text-link hover:underline">
            {url.replace(/^https?:\/\//, "")}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PinControl target={target} pin={pin} url={url} blocks={blocks} canChange />
      </CardContent>
    </Card>
  );
}
