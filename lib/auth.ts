import { betterAuth } from "better-auth";
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { db } from "./database";
import * as schema from "@/db/schema/auth-schema";

import { apiKey } from "@better-auth/api-key"
import { admin } from "better-auth/plugins"

export const auth = betterAuth({
	emailAndPassword: {
		enabled: true,
	},
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	plugins: [
		apiKey(),
		admin()
	]
});