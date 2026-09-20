function ProfileSection() {
	return (
		<section className="space-y-1">
			<h2 className="text-lg font-medium">Profile</h2>
			<p className="text-sm text-zinc-600">Account profile UI is stubbed.</p>
		</section>
	);
}

function APIKeysSection() {
	return (
		<section className="space-y-1">
			<h2 className="text-lg font-medium">API keys</h2>
			<p className="text-sm text-zinc-600">
				For the prototype, API keys are issued by the extension via{" "}
				<code className="rounded bg-zinc-100 px-1">POST /api/auth/exchange</code>{" "}
				(Roam append-only token → site API key). Web key management UI is not
				required for this slice. Teams/groups are out of scope.
			</p>
		</section>
	);
}

function DangerZoneSection() {
	return (
		<section className="space-y-1">
			<h2 className="text-lg font-medium">Danger zone</h2>
			<p className="text-sm text-zinc-600">Stub.</p>
		</section>
	);
}

export default function ProfilePage() {
	return (
		<main className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-10">
			<ProfileSection />
			<APIKeysSection />
			<DangerZoneSection />
		</main>
	);
}
