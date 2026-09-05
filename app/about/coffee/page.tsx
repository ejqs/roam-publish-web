import { Button } from "@/components/ui/button";

export default function AboutCoffee() {
	return (
		<div className="flex flex-col h-screen w-full items-center justify-center gap-2">
			<div>
				<p>i&apos;ll try to keep this as a free service</p>
			</div>
			<Button variant="link" nativeButton={false} render={<a href="https://buymeacoffee.com/ejqs" />}>
				buy me a coffee
			</Button>
		</div>
	)
}
