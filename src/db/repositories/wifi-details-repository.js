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
        .query(`
          SELECT id, location_id, ssid, password, access_notes, time_limits, purchase_required, created_at, status
          FROM wifi_details
          WHERE status = 'active'
            AND location_id IN (${db.sqlValues(locationIds)})
          ORDER BY created_at DESC, id DESC;
        `)
        .map(mapWifiDetail);
    },

    findActiveById(id) {
      const row = db.queryOne(`
        SELECT id, location_id, ssid, password, access_notes, time_limits, purchase_required, created_at, status
        FROM wifi_details
        WHERE id = ${db.sqlValue(id)} AND status = 'active';
      `);

      return row ? mapWifiDetail(row) : null;
    },

    create(locationId, payload) {
      return mapWifiDetail(
        db.queryOne(`
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
            ${db.sqlValue(locationId)},
            ${db.sqlValue(payload.ssid)},
            ${db.sqlValue(payload.password ?? null)},
            ${db.sqlValue(payload.access_notes ?? null)},
            ${db.sqlValue(payload.time_limits ?? null)},
            ${db.sqlValue(payload.purchase_required ?? false)},
            ${db.sqlValue(nowIso())},
            ${db.sqlValue("active")}
          )
          RETURNING id, location_id, ssid, password, access_notes, time_limits, purchase_required, created_at, status;
        `)
      );
    }
  };
}
