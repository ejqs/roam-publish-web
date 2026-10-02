"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

const item = buttonVariants({ variant: "ghost", className: "w-full justify-start" });

/** The signed-in header links that don't fit on a phone: Discover, Admin, theme and Log out. */
export function MobileMenu({ admin }: { admin: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label="Menu" title="Menu" />}>
        <MenuIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 gap-0.5 p-1">
        <Link href="/discover" className={item} onClick={close}>
          Discover
        </Link>
        {admin && (
          <Link href="/admin" className={item} onClick={close}>
            Admin
          </Link>
        )}
        <ThemeToggle withLabel className="w-full justify-start" />
        <SignOutButton className="w-full justify-start" />
      </PopoverContent>
    </Popover>
  );
}
