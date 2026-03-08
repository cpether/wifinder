import { nowIso } from "../client.js";

export function createReportsRepository({ db }) {
  return {
    create(payload) {
      return db.queryOne(`
        INSERT INTO reports (
          target_type,
          target_id,
          reason,
          reporter_token_hash,
          created_at,
          status
        ) VALUES (
          ${db.sqlValue(payload.target_type)},
          ${db.sqlValue(payload.target_id)},
          ${db.sqlValue(payload.reason)},
          ${db.sqlValue(payload.reporter_token_hash)},
          ${db.sqlValue(nowIso())},
          ${db.sqlValue("open")}
        )
        RETURNING id, target_type, target_id, reason, reporter_token_hash, created_at, status;
      `);
    }
  };
}
