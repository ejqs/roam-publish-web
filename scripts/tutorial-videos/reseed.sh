#!/bin/sh
# A fresh signed-in user with no graph, for the setup clip (which connects "my-notes").
set -e
cd "$(dirname "$0")/../.."
psql -q "${DATABASE_URL:-postgres://postgres@localhost:5433/roam_publish}" -c "delete from graph where name='my-notes'"
TEST_DATABASE_URL="${DATABASE_URL:-postgres://postgres@localhost:5433/roam_publish}" SEED=new bun test ./scripts/tutorial-videos/seed.ts
