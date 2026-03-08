import { nowIso } from "../client.js";

export function createReportsRepository({ db }) {
  return {
    create(payload) {
      return db.queryOne(
        `
          INSERT INTO reports (
            target_type,
            target_id,
            reason,
            reporter_token_hash,
            created_at,
            status
          ) VALUES (?, ?, ?, ?, ?, ?)
          RETURNING id, target_type, target_id, reason, reporter_token_hash, created_at, status;
        `,
        [payload.target_type, payload.target_id, payload.reason, payload.reporter_token_hash, nowIso(), "open"]
      );
    }
  };
}
