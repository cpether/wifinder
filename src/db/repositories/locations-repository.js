import { nowIso } from "../client.js";

export function createLocationsRepository({ db }) {
  return {
    listActive() {
      return db.query(`
        SELECT id, name, category, lat, lng, address, notes, place_source, created_at, status
        FROM locations
        WHERE status = 'active'
        ORDER BY created_at ASC, id ASC;
      `);
    },

    findActiveById(id) {
      return db.queryOne(`
        SELECT id, name, category, lat, lng, address, notes, place_source, created_at, status
        FROM locations
        WHERE id = ${db.sqlValue(id)} AND status = 'active';
      `);
    },

    create(payload) {
      return db.queryOne(`
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
          ${db.sqlValue(payload.name)},
          ${db.sqlValue(payload.category)},
          ${db.sqlValue(payload.lat)},
          ${db.sqlValue(payload.lng)},
          ${db.sqlValue(payload.address ?? null)},
          ${db.sqlValue(payload.notes ?? null)},
          ${db.sqlValue(payload.place_source ?? "user_submission")},
          ${db.sqlValue(nowIso())},
          ${db.sqlValue("active")}
        )
        RETURNING id, name, category, lat, lng, address, notes, place_source, created_at, status;
      `);
    }
  };
}
