

function ProfileSection() {
	return <div>Profile Section</div>
}

function APIKeysSection() {
	return <div>API Keys Section</div>
}

function ConnectionsSection() {
	return <div>Connections</div>

}

function DangerZoneSection() {
	return <div>Danger Zone Section</div>
}

export default function ProfilePage() {
	return <div>
		<ProfileSection></ProfileSection>
		<APIKeysSection></APIKeysSection>
		<DangerZoneSection></DangerZoneSection>
	</div>
}