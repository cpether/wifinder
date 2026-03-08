import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDbClient } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrations.js";
import { createHealthRepository } from "../src/db/repositories/health-repository.js";
import { createLocationsRepository } from "../src/db/repositories/locations-repository.js";
import { createReportsRepository } from "../src/db/repositories/reports-repository.js";
import { createVotesRepository } from "../src/db/repositories/votes-repository.js";
import { createWifiDetailsRepository } from "../src/db/repositories/wifi-details-repository.js";

async function createTestDatabase() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wifinder-db-test-"));
  const dbPath = path.join(tempDir, "wifinder.sqlite");
  const db = createDbClient({ dbPath });

  return {
    db,
    dbPath,
    cleanup: async () => {
      db.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}

function createRepositories(db) {
  return {
    healthRepository: createHealthRepository({ db }),
    locationsRepository: createLocationsRepository({ db }),
    wifiDetailsRepository: createWifiDetailsRepository({ db }),
    votesRepository: createVotesRepository({ db }),
    reportsRepository: createReportsRepository({ db })
  };
}

test("runMigrations bootstraps an empty database and is idempotent", async () => {
  const { db, cleanup } = await createTestDatabase();

  try {
    runMigrations(db);
    runMigrations(db);

    const tables = db
      .query(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name ASC;
        `
      )
      .map((row) => row.name);

    assert.deepEqual(tables, [
      "locations",
      "moderation_actions",
      "reports",
      "schema_migrations",
      "wifi_details",
      "wifi_votes"
    ]);

    const appliedMigrations = db.query("SELECT filename FROM schema_migrations ORDER BY filename ASC;");
    assert.deepEqual(appliedMigrations, [{ filename: "001_initial_schema.sql" }]);
  } finally {
    await cleanup();
  }
});

test("repositories persist records and health counts reflect direct database writes", async () => {
  const { db, cleanup } = await createTestDatabase();

  try {
    runMigrations(db);

    const {
      healthRepository,
      locationsRepository,
      wifiDetailsRepository,
      votesRepository,
      reportsRepository
    } = createRepositories(db);

    assert.deepEqual(healthRepository.getCounts(), {
      locations: 0,
      wifi_details: 0,
      wifi_votes: 0,
      reports: 0,
      moderation_actions: 0
    });

    const location = locationsRepository.create({
      name: "Repo Test Cafe",
      category: "cafe",
      lat: 51.5,
      lng: -0.12,
      address: "1 Repo Street",
      notes: "Window seats"
    });
    assert.equal(location.place_source, "user_submission");
    assert.equal(locationsRepository.listActive().length, 1);
    assert.equal(locationsRepository.findActiveById(location.id)?.name, "Repo Test Cafe");

    const wifiDetail = wifiDetailsRepository.create(location.id, {
      ssid: "RepoGuest",
      password: "daily-code",
      access_notes: "Ask at the till",
      time_limits: "2 hours",
      purchase_required: true
    });
    assert.equal(wifiDetail.purchase_required, true);

    const locationWifiDetails = wifiDetailsRepository.listActiveByLocationIds([location.id]);
    assert.equal(locationWifiDetails.length, 1);
    assert.equal(locationWifiDetails[0].ssid, "RepoGuest");
    assert.equal(locationWifiDetails[0].purchase_required, true);
    assert.equal(wifiDetailsRepository.findActiveById(wifiDetail.id)?.location_id, location.id);

    const report = reportsRepository.create({
      target_type: "wifi_detail",
      target_id: wifiDetail.id,
      reason: "Password changed",
      reporter_token_hash: "reporter-token"
    });
    assert.equal(report.status, "open");

    assert.deepEqual(healthRepository.getCounts(), {
      locations: 1,
      wifi_details: 1,
      wifi_votes: 0,
      reports: 1,
      moderation_actions: 0
    });
  } finally {
    await cleanup();
  }
});

test("votes repository upserts one active row per token and lists votes by wifi detail", async () => {
  const { db, cleanup } = await createTestDatabase();

  try {
    runMigrations(db);

    const { locationsRepository, wifiDetailsRepository, votesRepository } = createRepositories(db);

    const location = locationsRepository.create({
      name: "Vote Repo Cafe",
      category: "cafe",
      lat: 51.501,
      lng: -0.141
    });
    const wifiDetail = wifiDetailsRepository.create(location.id, {
      ssid: "VoteRepoGuest"
    });

    const firstVote = votesRepository.upsert({
      wifiDetailId: wifiDetail.id,
      voterTokenHash: "token-a",
      voteType: "works"
    });
    const updatedVote = votesRepository.upsert({
      wifiDetailId: wifiDetail.id,
      voterTokenHash: "token-a",
      voteType: "does_not_work"
    });
    const secondVoter = votesRepository.upsert({
      wifiDetailId: wifiDetail.id,
      voterTokenHash: "token-b",
      voteType: "works"
    });

    assert.equal(firstVote.id, updatedVote.id);
    assert.notEqual(secondVoter.id, updatedVote.id);

    const votesForWifiDetail = votesRepository.listByWifiDetailId(wifiDetail.id);
    assert.equal(votesForWifiDetail.length, 2);

    const votesByToken = new Map(votesForWifiDetail.map((vote) => [vote.voter_token_hash, vote.vote_type]));
    assert.equal(votesByToken.get("token-a"), "does_not_work");
    assert.equal(votesByToken.get("token-b"), "works");

    const groupedVotes = votesRepository.listByWifiDetailIds([wifiDetail.id]);
    assert.equal(groupedVotes.length, 2);
  } finally {
    await cleanup();
  }
});
