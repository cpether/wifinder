import { nowIso } from "../client.js";

export function createVotesRepository({ db }) {
  return {
    listByWifiDetailIds(wifiDetailIds = []) {
      if (wifiDetailIds.length === 0) {
        return [];
      }

      return db.query(
        `
          SELECT id, wifi_detail_id, voter_token_hash, vote_type, created_at, updated_at
          FROM wifi_votes
          WHERE wifi_detail_id IN (${db.placeholders(wifiDetailIds.length)})
          ORDER BY updated_at DESC, id DESC;
        `,
        wifiDetailIds
      );
    },

    listByWifiDetailId(wifiDetailId) {
      return db.query(
        `
          SELECT id, wifi_detail_id, voter_token_hash, vote_type, created_at, updated_at
          FROM wifi_votes
          WHERE wifi_detail_id = ?
          ORDER BY updated_at DESC, id DESC;
        `,
        [wifiDetailId]
      );
    },

    upsert({ wifiDetailId, voterTokenHash, voteType }) {
      const currentTime = nowIso();
      return db.queryOne(
        `
          INSERT INTO wifi_votes (
            wifi_detail_id,
            voter_token_hash,
            vote_type,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (wifi_detail_id, voter_token_hash)
          DO UPDATE SET
            vote_type = excluded.vote_type,
            updated_at = excluded.updated_at
          RETURNING id, wifi_detail_id, voter_token_hash, vote_type, created_at, updated_at;
        `,
        [wifiDetailId, voterTokenHash, voteType, currentTime, currentTime]
      );
    }
  };
}
