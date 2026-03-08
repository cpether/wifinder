export function createHealthRepository({ db }) {
  return {
    getCounts() {
      return db.queryOne(`
        SELECT
          (SELECT COUNT(*) FROM locations) AS locations,
          (SELECT COUNT(*) FROM wifi_details) AS wifi_details,
          (SELECT COUNT(*) FROM wifi_votes) AS wifi_votes,
          (SELECT COUNT(*) FROM reports) AS reports,
          (SELECT COUNT(*) FROM moderation_actions) AS moderation_actions;
      `);
    }
  };
}
