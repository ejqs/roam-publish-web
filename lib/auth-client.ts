import { apiKeyClient } from "@better-auth/api-key/client";
import { adminClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/client"
// import { sentinelClient } from "@better-auth/infra/client";

export const authClient = createAuthClient({
	// baseURL: "http://localhost:3000", // useful when auth infra in diff server
	plugins: [
		apiKeyClient(),
		adminClient()
	]
})

export const { signIn, signUp, useSession } = createAuthClient()