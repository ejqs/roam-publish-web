import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { dismissChangeLogIssue } from "./change-log-issue-actions";
import { GRAPH_LIST, graphPagesPath, listHref, parseListState } from "./filters";

type Issue = { shortlinkId: string; title: string; rootUid: string; graphName: string };

const roamPageUrl = (graph: string, uid: string) =>
  `https://roamresearch.com/#/app/${encodeURIComponent(graph)}/page/${encodeURIComponent(uid)}`;

/**
 * Pages whose Changelog block was deleted in Roam. roam.pub stopped their change log rather than let
 * Roam put entries on the daily note; the owner adds the blocks back or ignores it.
 */
export function ChangeLogIssues({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <Alert variant="warning" id="change-log-issues" className="scroll-mt-4 px-3 py-2.5">
      <TriangleAlertIcon />
      <AlertTitle>Change log stopped for {issues.length === 1 ? "1 page" : `${issues.length} pages`}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2 text-pretty">
        <p>
          Its <code>Changelog</code> block was deleted in Roam, so roam.pub stopped writing there (Roam would put the
          entries on your daily note instead). Open the page in Roam and publish it again to add the blocks back;
          changes are logged from then on. Or ignore it to leave the page without a change log.
        </p>
        <ul className="flex flex-col divide-y rounded-md border bg-card">
          {issues.map((i) => (
            <li key={i.shortlinkId} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {i.title} <span className="font-normal text-muted-foreground">· {i.graphName}</span>
              </span>
              <a
                href={roamPageUrl(i.graphName, i.rootUid)}
                target="_blank"
                rel="noopener"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open in Roam
              </a>
              <Link
                href={listHref(GRAPH_LIST, graphPagesPath(i.graphName), parseListState(GRAPH_LIST, { q: i.title }))}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Manage page
              </Link>
              <form action={dismissChangeLogIssue.bind(null, i.shortlinkId)}>
                <Button type="submit" variant="ghost" size="sm">
                  Ignore
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

