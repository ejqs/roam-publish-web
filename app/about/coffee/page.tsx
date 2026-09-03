import { Link } from "@blueprintjs/core";

export default function AboutCoffee() {
	return (
		<div className="flex flex-col h-screen w-full items-center justify-center gap-2">
			<div>
				<p>i'll try to keep this as a free service</p>
			</div>
			<Link href="https://buymeacoffee.com/ejqs">buy me a coffee</Link >
		</div>
	)
}