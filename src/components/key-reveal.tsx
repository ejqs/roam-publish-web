"use client";

import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { generateKey } from "@/app/(app)/dashboard/keys/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Generates (or regenerates) the viewer's API key for one graph and shows it once, with where to
 * paste it in Roam.
 */
export function KeyReveal({
  graphId,
  hasKey,
  size = "sm",
}: {
  graphId: string;
  hasKey: boolean;
  size?: "sm" | "default";
}) {
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function generate() {
    if (hasKey && !confirm("Regenerate this key? The current one stops working right away.")) return;
    start(async () => {
      const res = await generateKey(graphId);
      if (!res.ok) return void toast.error(res.message);
      setKey(res.key);
      setCopied(false);
    });
  }

  async function copy() {
    if (!key) return;
    await navigator.clipboard.writeText(key).catch(() => {});
    setCopied(true);
  }

  if (key) {
    return (
      <Alert className="w-full">
        <KeyRoundIcon />
        <AlertTitle>Your API key</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input readOnly value={key} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p>
            Paste it in Roam: <strong>Settings → Roam Publish → API key</strong>. This is the only time it&apos;s
            shown. If you lose it, regenerate it here.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Button type="button" variant={hasKey ? "outline" : "default"} size={size} disabled={pending} onClick={generate}>
      {pending ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon />}
      {hasKey ? "Regenerate key" : "Get API key"}
    </Button>
  );
}
