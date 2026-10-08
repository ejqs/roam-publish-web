import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ENCRYPTION_VERSIONS, type EncryptionVersion } from "@/lib/encryption-rules";

export const metadata: Metadata = {
  title: "Encryption versions · Roam Publish",
  description: "How each version of roam.pub's page encryption works: v1 by roam.pub, v2 end-to-end in Roam.",
};

/**
 * Encryption versions, newest first: what an encrypted page's "v…" badge means. Add one whenever how pages
 * are encrypted changes, with a matching ENCRYPTION_VERSIONS entry.
 */
const VERSIONS: { v: EncryptionVersion; name: string; since: string; points: string[] }[] = [
  {
    v: 2,
    name: "End-to-end encrypted",
    since: "roam.pub 0.18.0 and extension 0.2.0, 8 Oct 2026",
    points: [
      "The extension encrypts the page in Roam, with a new key for every publish, and seals that key to the password of each place it's shown.",
      "roam.pub gets only the encrypted page and the sealed keys. It never sees the text.",
      "Readers' browsers decrypt it once they unlock it with the password.",
      "Made by publishing or republishing from extension 0.2.0 or newer to a place that uses Password everywhere.",
    ],
  },
  {
    v: 1,
    name: "Encrypted",
    since: "roam.pub 0.3.0, 3 Oct 2026",
    points: [
      "The extension sends the text, and roam.pub encrypts it before storing it, so roam.pub saw it then.",
      "Stored encrypted with each place's password, so a copy of the database can't be read.",
      "Since roam.pub 0.16.3, readers' browsers decrypt it; roam.pub no longer decrypts it to show it.",
      "Still made by extensions older than 0.2.0 and by encrypting a page on your dashboard. Republish it from extension 0.2.0 or newer to make it v2.",
    ],
  },
];

export default function EncryptionVersionsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <article className="mx-auto flex w-full max-w-[700px] flex-col gap-6 rounded-sm bg-card px-5 py-8 text-[16px] shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-12 sm:py-12">
          <div className="flex flex-col gap-2">
            <h1 className="text-[32px] leading-tight font-semibold sm:text-[42px]">Encryption versions</h1>
            <p className="text-muted-foreground">
              An encrypted page shows its version next to its title. Newer versions don&apos;t change pages already
              encrypted: a page keeps its version until it&apos;s encrypted again. The rules for encrypted pages are in{" "}
              <Link href="/privacy/encryption" className="text-link hover:underline">
                Encrypted pages
              </Link>
              .
            </p>
          </div>
          {VERSIONS.map((x) => (
            <section key={x.v} id={`v${x.v}`} className="flex scroll-mt-20 flex-col gap-2 border-t pt-5">
              <h2 className="text-xl font-semibold">
                v{x.v} · {x.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                From {x.since}. {ENCRYPTION_VERSIONS[x.v].replace(/^./, (c) => c.toUpperCase())}.
              </p>
              <ul className="ml-5 flex list-disc flex-col gap-1.5 text-[15px] leading-relaxed">
                {x.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          ))}
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
