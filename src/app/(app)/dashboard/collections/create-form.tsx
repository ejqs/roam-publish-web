"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createCollection } from "./actions";

/** "Add collection" button that opens the create form in a dialog. */
export function AddCollectionDialog({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={variant}>
            <PlusIcon />
            Add collection
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>
            A collection gathers pages from any of your graphs, and from the people you invite, at roam.pub/c/name.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createCollection({ name, slug });
              if (!res.ok) return void toast.error(res.message);
              toast.success(res.message);
              setOpen(false);
              router.push(`/dashboard/collections/${res.slug}`);
            });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="collection-name">Name</FieldLabel>
              <Input
                id="collection-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Reading group"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="collection-slug">Address</FieldLabel>
              <Input
                id="collection-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="reading-group"
                required
              />
              <FieldDescription>
                roam.pub/c/{slug.trim().toLowerCase() || "name"}. Letters, numbers, - and _; not case-sensitive.
              </FieldDescription>
            </Field>
            <Button type="submit" className="self-end" disabled={pending || !name || !slug}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
