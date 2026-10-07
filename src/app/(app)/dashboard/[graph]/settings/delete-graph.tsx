"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DeleteDialog } from "@/components/manage/delete-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteGraph } from "@/server/actions/dashboard";

export function DeleteGraphCard({
  graphId,
  graphName,
  pageCount,
  locked,
}: {
  graphId: string;
  graphName: string;
  pageCount: number;
  /** A moderator suspended the graph or removed a page in it. */
  locked: boolean;
}) {
  const router = useRouter();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete graph</CardTitle>
        <CardDescription>
          {locked
            ? "A moderator acted on this graph, so it can't be deleted from here. Contact us to delete it."
            : "Permanently delete this graph from roam.pub. Nothing in Roam changes."}
        </CardDescription>
      </CardHeader>
      {!locked && (
        <CardContent>
          <DeleteDialog
            trigger="Delete graph"
            title={`Delete ${graphName}?`}
            confirmText={graphName}
            confirmLabel="Delete graph"
            onConfirm={async () => {
              const res = await deleteGraph(graphId, graphName);
              if (!res?.ok) return res?.message ?? "Could not delete the graph.";
              toast.success(res.message);
              router.push("/dashboard");
            }}
          >
            <p>
              {pageCount === 1 ? "Its page is" : `All ${pageCount} of its pages are`} deleted, including pages
              members published and their places in collections. Links to them stop working.
            </p>
            <p>Every API key for this graph stops working, and members lose access. This can&apos;t be undone.</p>
            <p>You can connect the graph again later, but its pages would need to be published again.</p>
          </DeleteDialog>
        </CardContent>
      )}
    </Card>
  );
}
