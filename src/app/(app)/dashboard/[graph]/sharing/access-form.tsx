"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { accessToSave, ContainerAccessFields, type ContainerAccess } from "@/components/manage/container-access-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import type { Access } from "@/db/schema";
import { saveContainerAccessBlocked } from "@/lib/control-rules";
import { ENCRYPT_PASSWORD_MIN } from "@/lib/encryption-rules";
import { changed, useUnsavedChanges } from "@/lib/unsaved-changes";
import { updateGraphAccess } from "@/server/actions/dashboard";

/** Who can open the front page, what new pages start as, and the graph password. */
export function GraphAccessForm({
  graphId,
  graphName,
  pageCount,
  initial,
  encryptedPages,
}: {
  graphId: string;
  graphName: string;
  pageCount: number;
  /** Titles of encrypted pages that open with the graph password. */
  encryptedPages: string[];
  initial: {
    indexAccess: Access;
    defaultAccess: Access;
    hasPassword: boolean;
    /** The saved password can encrypt new pages without being typed again. */
    canEncrypt: boolean;
    encryptNewPages: boolean;
  };
}) {
  const [access, setAccess] = useState<ContainerAccess>({
    indexAccess: initial.indexAccess,
    defaultAccess: initial.defaultAccess,
    encryptNewPages: initial.encryptNewPages,
    password: "",
    clearPassword: false,
  });
  const [hasPassword, setHasPassword] = useState(initial.hasPassword);
  const [canEncrypt, setCanEncrypt] = useState(initial.canEncrypt);
  const router = useRouter();
  const [pending, start] = useTransition();
  const blocked = saveContainerAccessBlocked("graph", access, hasPassword, encryptedPages.length);
  const form = (a: ContainerAccess, encrypt: boolean) => ({
    ...accessToSave(a, encrypt),
    currentPassword: undefined,
    resetEncrypted: undefined,
  });
  const [saved, setSaved] = useState(() => form(access, canEncrypt));
  const dirty = changed(form(access, canEncrypt), saved);
  useUnsavedChanges(dirty);

  function save() {
    start(async () => {
      const res = await updateGraphAccess(graphId, accessToSave(access, canEncrypt));
      if (!res?.ok) return void toast.error(res?.message ?? "Couldn't save.");
      // A new password long enough to encrypt with gets a key pair when it's saved.
      const encrypt = access.password ? access.password.length >= ENCRYPT_PASSWORD_MIN : !access.clearPassword && canEncrypt;
      if (access.password) setHasPassword(true);
      if (access.clearPassword) setHasPassword(false);
      setCanEncrypt(encrypt);
      const next = { ...access, password: "", clearPassword: false, currentPassword: "", resetEncrypted: false };
      setAccess(next);
      setSaved(form(next, encrypt));
      toast.success(res.message);
      // The Listing card below reads the saved front page access.
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent>
        <FieldGroup>
          <ContainerAccessFields
            kind="graph"
            label={graphName}
            containerId={graphId}
            pageCount={pageCount}
            value={access}
            hasPassword={hasPassword}
            canEncrypt={canEncrypt}
            encryptedPages={encryptedPages}
            onChange={setAccess}
          />
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end gap-3">
        {blocked && <p className="text-xs text-destructive">{blocked}</p>}
        {!blocked && dirty && !pending && <p className="text-xs text-muted-foreground">Unsaved changes</p>}
        <Button onClick={save} disabled={pending || !dirty || !!blocked}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardFooter>
    </Card>
  );
}
