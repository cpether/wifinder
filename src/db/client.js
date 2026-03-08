import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SQLITE_BINARY = "/usr/bin/sqlite3";

export function nowIso() {
  return new Date().toISOString();
}

function resolveDbPath(dbPath) {
  return path.resolve(process.cwd(), dbPath);
}

function runSql(dbPath, sql, { json = false } = {}) {
  const args = json ? ["-json", dbPath] : [dbPath];
  const output = execFileSync(SQLITE_BINARY, args, {
    encoding: "utf8",
    input: `PRAGMA foreign_keys = ON;\n${sql}`
  });

  if (!json) {
    return undefined;
  }

  const trimmed = output.trim();
  return trimmed.length === 0 ? [] : JSON.parse(trimmed);
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot persist non-finite number");
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlValues(values) {
  return values.map((value) => sqlValue(value)).join(", ");
}

export function createDbClient({ dbPath = "data/wifinder.sqlite" } = {}) {
  const resolvedDbPath = resolveDbPath(dbPath);
  fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });

  return {
    dbPath: resolvedDbPath,
    sqlValue,
    sqlValues,
    execute(sql) {
      runSql(resolvedDbPath, sql);
    },
    query(sql) {
      return runSql(resolvedDbPath, sql, { json: true });
    },
    queryOne(sql) {
      return this.query(sql)[0] ?? null;
    }
  };
}
