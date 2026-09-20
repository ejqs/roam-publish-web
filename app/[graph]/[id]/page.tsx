import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { PublishedContent } from "@/components/published-content";
import { db } from "@/lib/database";
import { graph, publication } from "@/db/schema/schema";

type PageProps = {
	params: Promise<{ graph: string; id: string }>;
};

export default async function PublicationPage({ params }: PageProps) {
	const { graph: graphName, id } = await params;
	const decodedGraph = decodeURIComponent(graphName);
	const decodedUid = decodeURIComponent(id);

	const graphs = await db
		.select()
		.from(graph)
		.where(eq(graph.name, decodedGraph))
		.limit(1);

	const g = graphs[0];
	if (!g) notFound();

	const rows = await db
		.select()
		.from(publication)
		.where(
			and(eq(publication.graphId, g.id), eq(publication.uid, decodedUid)),
		)
		.limit(1);

	const row = rows[0];
	if (!row || row.visibility === "private") {
		notFound();
	}

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-6 py-10">
			<header className="mb-8 border-b border-zinc-200 pb-4">
				<p className="text-sm text-zinc-500">
					<Link
						href={`/${encodeURIComponent(g.name)}`}
						className="underline-offset-4 hover:underline"
					>
						{g.name}
					</Link>
					<span className="mx-2">/</span>
					<span className="text-zinc-400">{row.kind}</span>
				</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
					{row.title}
				</h1>
				<p className="mt-2 text-xs text-zinc-500">
					Updated {row.updatedAt.toISOString().replace("T", " ").slice(0, 19)} UTC
				</p>
			</header>

			<article>
				<PublishedContent content={row.content} />
			</article>
		</main>
	);
}
