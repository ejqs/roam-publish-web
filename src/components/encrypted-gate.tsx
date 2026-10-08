import { PRIVACY_ICONS } from "@/components/privacy-icons";
import type { Lock } from "@/lib/gates";
import { UnlockForm } from "./unlock-form";

/**
 * The password prompt for an encrypted page. Rendered by the server for a reader who hasn't unlocked
 * it, and in the browser (`again`) for one who unlocked it but whose browser has no key to open it
 * with: unlocked before it was encrypted, before keys moved to the browser, or on another browser.
 */
export function EncryptedGate({
  lock,
  what,
  members,
  title,
  again,
}: {
  lock: Lock;
  what: string;
  members?: string;
  /** Shown above the prompt when the title may be shown (listed pages). */
  title?: string;
  again?: boolean;
}) {
  const Icon = PRIVACY_ICONS.encrypted;
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Icon className="size-6 text-muted-foreground" />
      {title && <p className="text-muted-foreground">{title}</p>}
      <h1 className="text-2xl font-semibold">{again ? "Enter the password again" : `This ${what} is encrypted`}</h1>
      <p className="max-w-md text-muted-foreground">
        {again ? `It opens in your browser, which needs the password once more. ` : `Enter its password to read it. `}
        Everyone needs the password{members ? `, including members of ${members}` : ""}.
      </p>
      <UnlockForm lock={lock} what={`this ${what}`} />
      <p className="text-xs text-muted-foreground">It&apos;s decrypted in your browser. Unlocking lasts 30 days on this browser.</p>
    </div>
  );
}
