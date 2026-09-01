import { apiKeyClient } from "@better-auth/api-key/client";
import { adminClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/client"
// import { sentinelClient } from "@better-auth/infra/client";

export const authClient = createAuthClient({
	// ... your existing config
	plugins: [
		apiKeyClient(),
		adminClient()
	]
})