// Make sure to install the 'pg' package 
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

// lib/database.ts
import { authRelations } from "@/db/schema/auth-schema";
// import { relations } from "@/db/schema/schema";

export const db = drizzle({
	client: pool,
	// authRelations uses defineRelationsPart,
	// so it must come after the main relations
	// relations: { ...relations, ...authRelations },
	relations: { ...authRelations },
});