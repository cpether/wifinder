import { nowIso } from "../client.js";

function mapWifiDetail(row) {
  return {
    ...row,
    purchase_required: Boolean(row.purchase_required)
  };
}

export function createWifiDetailsRepository({ db }) {
  return {
    listActiveByLocationIds(locationIds = []) {
      if (locationIds.length === 0) {
        return [];
      }

      return db
        .query(
          `
            SELECT id, location_id, ssid, password, access_notes, time_limits, purchase_required, created_at, status
            FROM wifi_details
            WHERE status = 'active'
              AND location_id IN (${db.placeholders(locationIds.length)})
            ORDER BY created_at DESC, id DESC;
          `,
          locationIds
        )
        .map(mapWifiDetail);
    },

    findActiveById(id) {
      const row = db.queryOne(
        `
          SELECT id, location_id, ssid, password, access_notes, time_limits, purchase_required, created_at, status
          FROM wifi_details
          WHERE id = ? AND status = 'active';
        `,
        [id]
      );

      return row ? mapWifiDetail(row) : null;
    },

    create(locationId, payload) {
      return mapWifiDetail(
        db.queryOne(
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id, location_id, ssid, password, access_notes, time_limits, purchase_required, created_at, status;
          `,
          [
            locationId,
            payload.ssid,
            payload.password ?? null,
            payload.access_notes ?? null,
            payload.time_limits ?? null,
            payload.purchase_required ?? false,
            nowIso(),
            "active"
          ]
        )
      );
    }
  };
}
