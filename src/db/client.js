import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function nowIso() {
  return new Date().toISOString();
}

function resolveDbPath(dbPath) {
  return path.resolve(process.cwd(), dbPath);
}

function normalizeParams(params = []) {
  return params.map((value) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Cannot persist non-finite number");
    }
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    return value ?? null;
  });
}

export function createDbClient({ dbPath = "data/wifinder.sqlite" } = {}) {
  const resolvedDbPath = resolveDbPath(dbPath);
  fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });
  const database = new Database(resolvedDbPath);
  database.pragma("foreign_keys = ON");

  return {
    dbPath: resolvedDbPath,
    placeholders(count) {
      return Array.from({ length: count }, () => "?").join(", ");
    },
    execute(sql, params = []) {
      const normalizedParams = normalizeParams(params);
      if (normalizedParams.length === 0) {
        database.exec(sql);
        return;
      }

      database.prepare(sql).run(...normalizedParams);
    },
    query(sql, params = []) {
      return database.prepare(sql).all(...normalizeParams(params));
    },
    queryOne(sql, params = []) {
      return database.prepare(sql).get(...normalizeParams(params)) ?? null;
    },
    transaction(run) {
      return database.transaction(run)();
    }
  };
}
