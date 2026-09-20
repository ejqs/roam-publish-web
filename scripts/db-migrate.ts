#!/usr/bin/env bun
// Apply SQL migrations in db/drizzle/<name>/migration.sql (lexical folder order).
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL is required");
	process.exit(1);
}

const root = join(import.meta.dir, "..", "db", "drizzle");
const dirs = (await readdir(root, { withFileTypes: true }))
	.filter((d) => d.isDirectory())
	.map((d) => d.name)
	.sort();

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS "_sql_migrations" (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`);

// Production already has Better Auth tables from earlier deploys, but no
// _sql_migrations bookkeeping. Mark those folders applied if present.
const authTables = await client.query(
	`SELECT to_regclass('public.user') AS user_table, to_regclass('public.apikey') AS apikey_table`,
);
if (authTables.rows[0]?.user_table) {
	await client.query(
		`INSERT INTO "_sql_migrations" (id) VALUES ($1) ON CONFLICT DO NOTHING`,
		["20260901123448_init better auth"],
	);
}
if (authTables.rows[0]?.apikey_table) {
	await client.query(
		`INSERT INTO "_sql_migrations" (id) VALUES ($1) ON CONFLICT DO NOTHING`,
		["20260901130417_add api-key and admin plugin"],
	);
}

for (const dir of dirs) {
	const id = dir;
	const already = await client.query(
		`SELECT 1 FROM "_sql_migrations" WHERE id = $1`,
		[id],
	);
	if (already.rowCount) {
		console.log(`skip ${id}`);
		continue;
	}
	const sqlPath = join(root, dir, "migration.sql");
	const sql = await readFile(sqlPath, "utf8");
	const statements = sql
		.split("--> statement-breakpoint")
		.map((s) => s.trim())
		.filter(Boolean);

	console.log(`apply ${id} (${statements.length} statements)`);
	await client.query("BEGIN");
	try {
		for (const statement of statements) {
			await client.query(statement);
		}
		await client.query(`INSERT INTO "_sql_migrations" (id) VALUES ($1)`, [id]);
		await client.query("COMMIT");
	} catch (err) {
		await client.query("ROLLBACK");
		console.error(`failed ${id}`, err);
		await client.end();
		process.exit(1);
	}
}

await client.end();
console.log("migrations done");
