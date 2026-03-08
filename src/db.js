import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeLocation, summarizeVotes } from "./confidence.js";
import { distanceMeters } from "./geo.js";

const SQLITE_BINARY = "/usr/bin/sqlite3";
const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

function nowIso() {
  return new Date().toISOString();
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

function resolveDbPath(dbPath) {
  return path.resolve(process.cwd(), dbPath);
}

function mapWifiDetail(row) {
  return {
    ...row,
    purchase_required: Boolean(row.purchase_required)
  };
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

export function createStore({ dbPath = "data/wifinder.sqlite" } = {}) {
  const resolvedDbPath = resolveDbPath(dbPath);
  fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });

  function execute(sql) {
    runSql(resolvedDbPath, sql);
  }

  function query(sql) {
    return runSql(resolvedDbPath, sql, { json: true });
  }

  function queryOne(sql) {
    return query(sql)[0] ?? null;
  }

  function runMigrations() {
    execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = new Set(
      query("SELECT filename FROM schema_migrations ORDER BY filename ASC;").map((row) => row.filename)
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
      execute(`
        BEGIN IMMEDIATE;
        ${migrationSql}
        INSERT INTO schema_migrations (filename, applied_at)
        VALUES (${sqlValue(filename)}, ${sqlValue(nowIso())});
        COMMIT;
      `);
    }
  }

  function seedIfEmpty() {
    const row = queryOne("SELECT COUNT(*) AS count FROM locations;");
    if ((row?.count ?? 0) > 0) {
      return;
    }

    const createdAt = nowIso();
    execute(`
      BEGIN IMMEDIATE;
      INSERT INTO locations (
        name,
        category,
        lat,
        lng,
        address,
        notes,
        place_source,
        created_at,
        status
      ) VALUES (
        ${sqlValue("Central Library Cafe")},
        ${sqlValue("cafe")},
        51.5079,
        -0.1283,
        ${sqlValue("Trafalgar Sq, London")},
        ${sqlValue("Large seating area")},
        ${sqlValue("seed")},
        ${sqlValue(createdAt)},
        ${sqlValue("active")}
      );

      INSERT INTO wifi_details (
        location_id,
        ssid,
        password,
        access_notes,
        time_limits,
        purchase_required,
        created_at,
        status
      ) VALUES (
        last_insert_rowid(),
        ${sqlValue("LibraryGuest")},
        NULL,
        ${sqlValue("Ask staff for current daily code.")},
        NULL,
        0,
        ${sqlValue(createdAt)},
        ${sqlValue("active")}
      );
      COMMIT;
    `);
  }

  function getActiveLocations() {
    return query(`
      SELECT id, name, category, lat, lng, address, notes, place_source, created_at, status
      FROM locations
      WHERE status = 'active'
      ORDER BY created_at ASC, id ASC;
    `);
  }

  function getWifiDetails(locationIds = []) {
    if (locationIds.length === 0) {
      return [];
    }

    return query(`
      SELECT id, location_id, ssid, password, access_notes, time_limits, purchase_required, created_at, status
      FROM wifi_details
      WHERE status = 'active'
        AND location_id IN (${sqlValues(locationIds)})
      ORDER BY created_at DESC, id DESC;
    `).map(mapWifiDetail);
  }

  function getVotes(wifiDetailIds = []) {
    if (wifiDetailIds.length === 0) {
      return [];
    }

    return query(`
      SELECT id, wifi_detail_id, voter_token_hash, vote_type, created_at, updated_at
      FROM wifi_votes
      WHERE wifi_detail_id IN (${sqlValues(wifiDetailIds)})
      ORDER BY updated_at DESC, id DESC;
    `);
  }

  function hydrateLocations(locations) {
    const wifiDetails = getWifiDetails(locations.map((location) => location.id));
    const votes = getVotes(wifiDetails.map((detail) => detail.id));

    const votesByWifiDetailId = new Map();
    for (const vote of votes) {
      const grouped = votesByWifiDetailId.get(vote.wifi_detail_id) ?? [];
      grouped.push(vote);
      votesByWifiDetailId.set(vote.wifi_detail_id, grouped);
    }

    const wifiDetailsByLocationId = new Map();
    for (const detail of wifiDetails) {
      const enrichedDetail = {
        ...detail,
        summary: summarizeVotes(votesByWifiDetailId.get(detail.id) ?? [])
      };

      const grouped = wifiDetailsByLocationId.get(detail.location_id) ?? [];
      grouped.push(enrichedDetail);
      wifiDetailsByLocationId.set(detail.location_id, grouped);
    }

    return locations.map((location) => {
      const locationWifiDetails = wifiDetailsByLocationId.get(location.id) ?? [];
      return {
        ...location,
        ...summarizeLocation(locationWifiDetails.map((detail) => detail.summary)),
        wifi_details: locationWifiDetails
      };
    });
  }

  runMigrations();
  seedIfEmpty();

  return {
    health() {
      const counts = queryOne(`
        SELECT
          (SELECT COUNT(*) FROM locations) AS locations,
          (SELECT COUNT(*) FROM wifi_details) AS wifi_details,
          (SELECT COUNT(*) FROM wifi_votes) AS wifi_votes,
          (SELECT COUNT(*) FROM reports) AS reports,
          (SELECT COUNT(*) FROM moderation_actions) AS moderation_actions;
      `);

      return {
        status: "ok",
        now: nowIso(),
        data_counts: counts
      };
    },

    listNearby({ lat, lng, radius, category }) {
      return hydrateLocations(getActiveLocations())
        .map((location) => ({
          location,
          distance: distanceMeters(lat, lng, location.lat, location.lng)
        }))
        .filter(({ location, distance }) => {
          if (distance > radius) {
            return false;
          }
          if (category && location.category !== category) {
            return false;
          }
          return true;
        })
        .sort((left, right) => left.distance - right.distance)
        .map(({ location, distance }) => {
          const { wifi_details, ...summaryLocation } = location;
          return {
            ...summaryLocation,
            distance_m: Math.round(distance)
          };
        });
    },

    search({ q, lat, lng, radius, category, verified }) {
      const normalizedQuery = q ? q.toLowerCase() : null;
      const hasCenter = Number.isFinite(lat) && Number.isFinite(lng);

      return hydrateLocations(getActiveLocations())
        .map((location) => {
          const distance = hasCenter ? distanceMeters(lat, lng, location.lat, location.lng) : null;
          const textBlob = `${location.name} ${location.address ?? ""} ${location.category}`.toLowerCase();
          const textScore = normalizedQuery
            ? textBlob.includes(normalizedQuery)
              ? 100
              : normalizedQuery
                  .split(/\s+/)
                  .filter(Boolean)
                  .reduce((score, token) => score + (textBlob.includes(token) ? 20 : 0), 0)
            : 0;
          const distanceScore =
            hasCenter && distance !== null ? Math.max(0, 100 - Math.round(distance / 50)) : 0;

          return {
            location,
            distance,
            totalScore: textScore + location.wifi_confidence + distanceScore
          };
        })
        .filter(({ location, distance }) => {
          if (normalizedQuery) {
            const textBlob = `${location.name} ${location.address ?? ""} ${location.category}`.toLowerCase();
            if (
              !textBlob.includes(normalizedQuery) &&
              !normalizedQuery.split(/\s+/).some((token) => textBlob.includes(token))
            ) {
              return false;
            }
          }
          if (category && location.category !== category) {
            return false;
          }
          if (verified && location.freshness_badge !== "Verified recently") {
            return false;
          }
          if (hasCenter && distance !== null && distance > radius) {
            return false;
          }
          return true;
        })
        .sort((left, right) => right.totalScore - left.totalScore)
        .map(({ location, distance }) => {
          const { wifi_details, ...summaryLocation } = location;
          return {
            ...summaryLocation,
            distance_m: distance === null ? null : Math.round(distance)
          };
        });
    },

    getLocationById(id) {
      const row = queryOne(`
        SELECT id, name, category, lat, lng, address, notes, place_source, created_at, status
        FROM locations
        WHERE id = ${sqlValue(id)} AND status = 'active';
      `);

      if (!row) {
        return null;
      }

      return hydrateLocations([row])[0];
    },

    createLocation(payload) {
      const location = queryOne(`
        INSERT INTO locations (
          name,
          category,
          lat,
          lng,
          address,
          notes,
          place_source,
          created_at,
          status
        ) VALUES (
          ${sqlValue(payload.name)},
          ${sqlValue(payload.category)},
          ${sqlValue(payload.lat)},
          ${sqlValue(payload.lng)},
          ${sqlValue(payload.address ?? null)},
          ${sqlValue(payload.notes ?? null)},
          ${sqlValue(payload.place_source ?? "user_submission")},
          ${sqlValue(nowIso())},
          ${sqlValue("active")}
        )
        RETURNING id, name, category, lat, lng, address, notes, place_source, created_at, status;
      `);

      return {
        ...location,
        ...summarizeLocation([])
      };
    },

    createWifiDetail(locationId, payload) {
      const location = queryOne(`
        SELECT id
        FROM locations
        WHERE id = ${sqlValue(locationId)} AND status = 'active';
      `);
      if (!location) {
        return null;
      }

      return mapWifiDetail(
        queryOne(`
          INSERT INTO wifi_details (
            location_id,
            ssid,
            password,
            access_notes,
            time_limits,
            purchase_required,
            created_at,
            status
          ) VALUES (
            ${sqlValue(locationId)},
            ${sqlValue(payload.ssid)},
            ${sqlValue(payload.password ?? null)},
            ${sqlValue(payload.access_notes ?? null)},
            ${sqlValue(payload.time_limits ?? null)},
            ${sqlValue(payload.purchase_required ?? false)},
            ${sqlValue(nowIso())},
            ${sqlValue("active")}
          )
          RETURNING id, location_id, ssid, password, access_notes, time_limits, purchase_required, created_at, status;
        `)
      );
    },

    upsertVote({ wifiDetailId, voterTokenHash, voteType }) {
      const wifiDetail = queryOne(`
        SELECT id
        FROM wifi_details
        WHERE id = ${sqlValue(wifiDetailId)} AND status = 'active';
      `);
      if (!wifiDetail) {
        return null;
      }

      const currentTime = nowIso();
      return queryOne(`
        INSERT INTO wifi_votes (
          wifi_detail_id,
          voter_token_hash,
          vote_type,
          created_at,
          updated_at
        ) VALUES (
          ${sqlValue(wifiDetailId)},
          ${sqlValue(voterTokenHash)},
          ${sqlValue(voteType)},
          ${sqlValue(currentTime)},
          ${sqlValue(currentTime)}
        )
        ON CONFLICT (wifi_detail_id, voter_token_hash)
        DO UPDATE SET
          vote_type = excluded.vote_type,
          updated_at = excluded.updated_at
        RETURNING id, wifi_detail_id, voter_token_hash, vote_type, created_at, updated_at;
      `);
    },

    getWifiSummary(wifiDetailId) {
      const wifiDetail = queryOne(`
        SELECT id
        FROM wifi_details
        WHERE id = ${sqlValue(wifiDetailId)} AND status = 'active';
      `);
      if (!wifiDetail) {
        return null;
      }

      return summarizeVotes(
        query(`
          SELECT id, wifi_detail_id, voter_token_hash, vote_type, created_at, updated_at
          FROM wifi_votes
          WHERE wifi_detail_id = ${sqlValue(wifiDetailId)}
          ORDER BY updated_at DESC, id DESC;
        `)
      );
    },

    createReport(payload) {
      return queryOne(`
        INSERT INTO reports (
          target_type,
          target_id,
          reason,
          reporter_token_hash,
          created_at,
          status
        ) VALUES (
          ${sqlValue(payload.target_type)},
          ${sqlValue(payload.target_id)},
          ${sqlValue(payload.reason)},
          ${sqlValue(payload.reporter_token_hash)},
          ${sqlValue(nowIso())},
          ${sqlValue("open")}
        )
        RETURNING id, target_type, target_id, reason, reporter_token_hash, created_at, status;
      `);
    }
  };
}
