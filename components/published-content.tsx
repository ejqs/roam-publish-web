import type { ReactNode } from "react";
import type { RoamJsonNode, StoredContent } from "@/lib/publish";

function renderNodes(nodes: RoamJsonNode[] | undefined): ReactNode {
	if (!nodes?.length) return null;
	return (
		<ul className="my-2 list-disc space-y-1 pl-6 text-[15px] leading-relaxed text-zinc-800">
			{nodes.map((node, i) => (
				<li key={node.uid || `${i}-${node.string?.slice(0, 24) || "n"}`}>
					{node.string ? <span>{node.string}</span> : null}
					{renderNodes(node.children)}
				</li>
			))}
		</ul>
	);
}

export function PublishedContent({ content }: { content: unknown }) {
	const c = content as StoredContent | null;
	if (!c || typeof c !== "object") {
		return <p className="text-zinc-500">No content.</p>;
	}

	if (c.format === "markdown") {
		return (
			<pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-zinc-800">
				{c.body}
			</pre>
		);
	}

	if (c.format === "roam-json-v1") {
		return (
			<div>
				{c.string ? (
					<p className="mb-3 text-[15px] leading-relaxed text-zinc-800">
						{c.string}
					</p>
				) : null}
				{renderNodes(c.children)}
			</div>
		);
	}

	return (
		<pre className="overflow-auto rounded bg-zinc-100 p-3 text-xs text-zinc-700">
			{JSON.stringify(content, null, 2)}
		</pre>
	);
}
