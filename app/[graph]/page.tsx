import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/database";
import { graph, publication } from "@/db/schema/schema";

type PageProps = {
	params: Promise<{ graph: string }>;
};

export default async function GraphPage({ params }: PageProps) {
	const { graph: graphName } = await params;
	const decoded = decodeURIComponent(graphName);

	const graphs = await db
		.select()
		.from(graph)
		.where(eq(graph.name, decoded))
		.limit(1);

	const g = graphs[0];
	if (!g) notFound();

	const items = await db
		.select()
		.from(publication)
		.where(
			and(eq(publication.graphId, g.id), ne(publication.visibility, "private")),
		)
		.orderBy(desc(publication.updatedAt));

	const publicItems = items.filter((i) => i.visibility === "public");

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col px-6 py-10">
			<header className="mb-8 border-b border-zinc-200 pb-4">
				<p className="text-sm text-zinc-500">
					<Link href="/" className="underline-offset-4 hover:underline">
						Roam Publish
					</Link>
				</p>
				<h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
					{g.name}
				</h1>
				<p className="mt-1 text-sm text-zinc-600">
					Public pages from this Roam graph.
				</p>
			</header>

			{publicItems.length === 0 ? (
				<p className="text-zinc-500">No public publications yet.</p>
			) : (
				<ul className="space-y-3">
					{publicItems.map((item) => (
						<li key={item.id}>
							<Link
								href={`/${encodeURIComponent(g.name)}/${encodeURIComponent(item.uid)}`}
								className="text-lg text-zinc-900 underline-offset-4 hover:underline"
							>
								{item.title}
							</Link>
							<p className="text-xs text-zinc-500">
								{item.kind} · {item.updatedAt.toISOString().slice(0, 10)}
							</p>
						</li>
					))}
				</ul>
			)}
		</main>
	);
}
