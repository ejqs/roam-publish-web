import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminPage } from "@/lib/admin";
import { ACTIVE_DAYS, extAtLeast, extVersionUse } from "@/lib/ext-version";
import { liveExtVersion } from "@/lib/whats-new";
import { fmtDate, STACKED_TABLE } from "../ui";

export const metadata = { title: "Extension · Admin" };

/** Which extension versions are still calling, so an older API is only retired once nobody uses it. */
export default async function AdminExtensionPage() {
  await requireAdminPage("/admin/extension");
  const [use, live] = await Promise.all([extVersionUse(), liveExtVersion()]);
  const people = use.reduce((n, r) => n + r.people, 0);
  const behind = live ? use.filter((r) => !extAtLeast(r.version, live)).reduce((n, r) => n + r.people, 0) : null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Extension versions</h2>
      <p className="text-sm text-muted-foreground">
        Installs that called roam.pub in the last {ACTIVE_DAYS} days, by version. Roam Depot serves{" "}
        {live ? <strong className="text-foreground">{live}</strong> : "no version we could read"}.{" "}
        {behind === null
          ? null
          : people === 0
            ? "No installs have called yet."
            : behind === 0
              ? "Everyone is on it, so code kept only for older versions can go."
              : `${behind} of ${people} ${people === 1 ? "person is" : "people are"} on an older version.`}{" "}
        &ldquo;Before 0.2.0&rdquo; is every version that doesn&apos;t say which it is. A person counts once per
        version they used. &ldquo;Can&apos;t encrypt&rdquo; counts installs where Roam lacks the encryption
        Password pages will need (older desktop apps); they publish in plain until Roam is updated.
      </p>
      <Table className={STACKED_TABLE}>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>People</TableHead>
            <TableHead>Graphs</TableHead>
            <TableHead>Can&apos;t encrypt</TableHead>
            <TableHead>Last call</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {use.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Nothing yet.
              </TableCell>
            </TableRow>
          )}
          {use.map((r) => (
            <TableRow key={r.version ?? "unknown"}>
              <TableCell className="font-medium">
                {r.version ?? "Before 0.2.0"}{" "}
                {live && r.version === live && <Badge variant="secondary">Live</Badge>}
                {live && !extAtLeast(r.version, live) && <Badge variant="outline">Older</Badge>}
              </TableCell>
              <TableCell data-label="People">{r.people}</TableCell>
              <TableCell data-label="Graphs">{r.graphs}</TableCell>
              <TableCell data-label="Can't encrypt" className={r.cantSeal ? "text-destructive" : "text-muted-foreground"}>
                {r.cantSeal}
              </TableCell>
              <TableCell data-label="Last call" className="text-muted-foreground">
                {fmtDate(r.lastSeenAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
