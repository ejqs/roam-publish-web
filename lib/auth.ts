import { betterAuth } from "better-auth";
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { db } from "./database";
import * as schema from "@/db/schema/auth-schema";

import { apiKey } from "@better-auth/api-key"
import { admin } from "better-auth/plugins"
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
	emailAndPassword: {
		enabled: true,

		// https://better-auth.com/docs/authentication/email-password#plugins-that-add-user-fields
		customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
			...coreFields,
			// Admin plugin fields (in schema order)
			role: "user",
			banned: false,
			banReason: null,
			banExpires: null,
			// Your additional fields
			...additionalFields,
			// ID must be last to match database output order
			id,
		}),
	},
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	plugins: [
		apiKey(),
		admin(),
		nextCookies(),
	]
});