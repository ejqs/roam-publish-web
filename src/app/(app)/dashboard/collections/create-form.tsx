"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createCollection } from "./actions";

export function CreateCollectionForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>New collection</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createCollection({ name, slug });
              if (!res.ok) return void toast.error(res.message);
              toast.success(res.message);
              router.push(`/dashboard/collections/${res.slug}`);
            });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Reading group" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="slug">Address</FieldLabel>
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="reading-group" required />
              <FieldDescription>
                roam.pub/c/{slug.trim().toLowerCase() || "name"}. Letters, numbers, - and _; not case-sensitive.
              </FieldDescription>
            </Field>
            <Button type="submit" className="self-end" disabled={pending || !name || !slug}>
              Create
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
