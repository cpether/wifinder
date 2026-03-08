import { nowIso } from "./client.js";

export function seedDefaultData(db) {
  const row = db.queryOne("SELECT COUNT(*) AS count FROM locations;");
  if ((row?.count ?? 0) > 0) {
    return;
  }

  const createdAt = nowIso();
  db.transaction(() => {
    const insertedLocation = db.queryOne(
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
        RETURNING id;
      `,
      [
        "Central Library Cafe",
        "cafe",
        51.5079,
        -0.1283,
        "Trafalgar Sq, London",
        "Large seating area",
        "seed",
        createdAt,
        "active"
      ]
    );

    db.execute(
      `
        INSERT INTO wifi_details (
          location_id,
          ssid,
          password,
          access_notes,
          time_limits,
          purchase_required,
          created_at,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [insertedLocation.id, "LibraryGuest", null, "Ask staff for current daily code.", null, false, createdAt, "active"]
    );
  });
}
