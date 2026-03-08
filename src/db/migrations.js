import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nowIso } from "./client.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

export function runMigrations(db) {
  db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.query("SELECT filename FROM schema_migrations ORDER BY filename ASC;").map((row) => row.filename)
  );

  const filenames = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((filename) => filename.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  for (const filename of filenames) {
    if (applied.has(filename)) {
      continue;
    }

    const migrationSql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
    db.execute(`
      BEGIN IMMEDIATE;
      ${migrationSql}
      INSERT INTO schema_migrations (filename, applied_at)
      VALUES (${db.sqlValue(filename)}, ${db.sqlValue(nowIso())});
      COMMIT;
    `);
  }
}
