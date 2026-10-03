"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import type { VariantProps } from "class-variance-authority";
import { Button, type buttonVariants } from "@/components/ui/button";

export function CopyButton({
  text,
  label = "Copy link",
  variant = "outline",
  size = "icon-sm",
}: {
  text: string;
  label?: string;
} & Pick<VariantProps<typeof buttonVariants>, "variant" | "size">) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <Button variant={variant} size={size} onClick={copy} aria-label={label} title={label}>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
