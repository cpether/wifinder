import { nowIso } from "./client.js";

export function seedDefaultData(db) {
  const row = db.queryOne("SELECT COUNT(*) AS count FROM locations;");
  if ((row?.count ?? 0) > 0) {
    return;
  }

  const createdAt = nowIso();
  db.execute(`
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
      ${db.sqlValue("Central Library Cafe")},
      ${db.sqlValue("cafe")},
      51.5079,
      -0.1283,
      ${db.sqlValue("Trafalgar Sq, London")},
      ${db.sqlValue("Large seating area")},
      ${db.sqlValue("seed")},
      ${db.sqlValue(createdAt)},
      ${db.sqlValue("active")}
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
      ${db.sqlValue("LibraryGuest")},
      NULL,
      ${db.sqlValue("Ask staff for current daily code.")},
      NULL,
      0,
      ${db.sqlValue(createdAt)},
      ${db.sqlValue("active")}
    );
    COMMIT;
  `);
}
