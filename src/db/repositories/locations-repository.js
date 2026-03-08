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
      return db.queryOne(
        `
          SELECT id, name, category, lat, lng, address, notes, place_source, created_at, status
          FROM locations
          WHERE id = ? AND status = 'active';
        `,
        [id]
      );
    },

    create(payload) {
      return db.queryOne(
        `
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id, name, category, lat, lng, address, notes, place_source, created_at, status;
        `,
        [
          payload.name,
          payload.category,
          payload.lat,
          payload.lng,
          payload.address ?? null,
          payload.notes ?? null,
          payload.place_source ?? "user_submission",
          nowIso(),
          "active"
        ]
      );
    }
  };
}
