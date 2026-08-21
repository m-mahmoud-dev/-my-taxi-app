#!/usr/bin/env node
/**
 * Minimal migration runner for the NeonDB (Postgres) schema.
 *
 * Usage:
 *   DATABASE_URL=postgresql://neondb_owner:npg_aNwSj7Dc2zxv@ep-gentle-bar-aya2hf5u-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require

 *
 * Applies db/migrations/*.sql in filename order and records each applied
 * version in the schema_migrations table. Migrations are idempotent.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "db", "migrations");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getApplied() {
  const { rows } = await pool.query("SELECT version FROM schema_migrations");
  return new Set(rows.map((r) => r.version));
}

async function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function main() {
  const command = process.argv[2] ?? "up";

  await ensureMigrationsTable();
  const applied = await getApplied();
  const files = await listMigrations();

  if (command === "status") {
    for (const file of files) {
      console.log(`${applied.has(file) ? "[x]" : "[ ]"} ${file}`);
    }
    return;
  }

  if (command !== "up") {
    console.error(`Unknown command "${command}". Expected "up" or "status".`);
    process.exit(1);
  }

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const migration = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`Applying ${file} ...`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migration);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    ran += 1;
  }

  await pool.end();
  console.log(ran === 0 ? "No pending migrations." : `Applied ${ran} migration(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});