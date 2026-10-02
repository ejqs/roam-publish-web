"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Confirm for something that can't be undone: the button stays disabled until `confirmText` is typed.
 * `onConfirm` returns an error message to show, or nothing when it worked.
 */
export function DeleteDialog({
  trigger,
  title,
  children,
  confirmText,
  confirmLabel,
  onConfirm,
}: {
  trigger: string;
  title: string;
  children: React.ReactNode;
  confirmText: string;
  confirmLabel: string;
  onConfirm: () => Promise<string | void>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <DialogTrigger render={<Button variant="destructive">{trigger}</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription render={<div className="flex flex-col gap-2" />}>{children}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const error = await onConfirm();
              if (error) toast.error(error);
            });
          }}
        >
          <Field>
            <FieldLabel htmlFor="delete-confirm">
              Type <span className="font-mono">{confirmText}</span> to confirm
            </FieldLabel>
            <Input
              id="delete-confirm"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== confirmText}>
              {pending ? "Deleting…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
