import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { db } from "@/db";

let ready: Promise<void> | null = null;

/** Creates the test database if needed and applies every migration, once per run. */
export function migrateTestDb() {
  ready ??= (async () => {
    const url = new URL(process.env.DATABASE_URL!);
    const name = url.pathname.slice(1);
    url.pathname = "/postgres";
    const admin = new Client({ connectionString: url.toString() });
    await admin.connect();
    const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if (!rowCount) await admin.query(`create database "${name}"`);
    await admin.end();
    await migrate(db, { migrationsFolder: "drizzle" });
  })();
  return ready;
}

/** Empties every app and auth table. */
export async function resetDb() {
  await migrateTestDb();
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.length)
    await db.execute(sql.raw(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`));
}
