"use client";

import { LockIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unlock } from "@/app/unlock/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UnlockForm({ lock, what }: { lock: { scope: "graph" | "collection" | "publication" | "entry"; id: string }; what: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex w-full max-w-sm flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await unlock({ ...lock, password });
          if (!res.ok) return setError(res.message);
          router.refresh();
        });
      }}
    >
      <div className="flex gap-2">
        <Input
          type="password"
          autoComplete="current-password"
          aria-label={`Password for ${what}`}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
        />
        <Button type="submit" disabled={pending || !password}>
          <LockIcon /> Unlock
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
