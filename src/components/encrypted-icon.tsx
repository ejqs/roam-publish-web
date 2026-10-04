import { LockIcon, type LucideProps } from "lucide-react";
import { cn } from "cn";

/**
 * Encrypted: the password lock with the letter E beside it. `className` styles both, so the E takes
 * the lock's color and spacing; it's sized to the surrounding text.
 */
export function EncryptedIcon({ className, ...props }: LucideProps) {
  return (
    <span className="inline-flex shrink-0 items-end gap-px">
      <LockIcon className={className} {...props} />
      <span aria-hidden className={cn(className, "size-auto text-[0.85em] leading-[0.75] font-semibold")}>
        E
      </span>
    </span>
  );
}
