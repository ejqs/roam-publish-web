/**
 * Pre-deploy gate for the Railway `staging` environment (the shadow database).
 *
 * Runs the full test suite against a throwaway `roam_publish_test` database on the staging Postgres server, then
 * migrates the staging app database. A failure fails the deploy, so a bad `develop` never goes green.
 * The integration tests truncate every table, so this refuses to run anywhere but staging.
 */
const env = process.env.RAILWAY_ENVIRONMENT_NAME;
if (env !== "staging") {
  console.error(`staging-check refuses to run in "${env ?? "unknown"}": it empties the database it tests against.`);
  process.exit(1);
}

const base = process.env.DATABASE_URL;
if (!base) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const testUrl = new URL(base);
testUrl.pathname = "/roam_publish_test";

const run = (cmd: string[], extra: Record<string, string> = {}) => {
  const { exitCode } = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit", env: { ...process.env, ...extra } });
  if (exitCode !== 0) process.exit(exitCode ?? 1);
};

// Railway's own settings (staging URL, secrets) would leak into the tests, which assume their defaults from
// tests/helpers/preload.ts, so pin those back to the same values the tests use locally and in CI.
run(["bun", "run", "test"], {
  TEST_DATABASE_URL: testUrl.toString(),
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
  BETTER_AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  APPEND_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
});
run(["bun", "run", "db:migrate"]);
