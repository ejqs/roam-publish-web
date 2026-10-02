"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const THEMES = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
] as const;

const subscribe = () => () => {};

/** Icon button that cycles the color theme: light → dark → system. `withLabel` also names the current one. */
export function ThemeToggle({
  className,
  size = "icon",
  withLabel = false,
}: {
  className?: string;
  size?: "icon" | "icon-sm";
  withLabel?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known on the client; render the "system" icon until hydrated.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const i = Math.max(0, THEMES.findIndex((t) => t.value === (mounted ? theme : "system")));
  const current = THEMES[i];
  const next = THEMES[(i + 1) % THEMES.length];

  return (
    <Button
      variant="ghost"
      size={withLabel ? "default" : size}
      className={className}
      onClick={() => setTheme(next.value)}
      aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
      title={`Theme: ${current.label}`}
    >
      <current.Icon />
      {withLabel && `Theme: ${current.label}`}
    </Button>
  );
}
