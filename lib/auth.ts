import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { db } from "./database";
import * as authSchema from "@/db/schema/auth-schema";
import { apiKey } from "@better-auth/api-key";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,
	secret: process.env.BETTER_AUTH_SECRET,
	emailAndPassword: {
		enabled: true,

		// https://better-auth.com/docs/authentication/email-password#plugins-that-add-user-fields
		customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
			...coreFields,
			role: "user",
			banned: false,
			banReason: null,
			banExpires: null,
			...additionalFields,
			id,
		}),
	},
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: authSchema,
	}),
	plugins: [
		apiKey({
			enableMetadata: true,
			rateLimit: {
				enabled: true,
				timeWindow: 1000 * 60 * 60, // 1 hour
				maxRequests: 1000,
			},
		}),
		admin(),
		nextCookies(),
	],
});
