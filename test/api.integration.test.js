import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/server.js";
import { CONFIG } from "../src/config.js";

function createTestConfig(dbPath) {
  return {
    ...CONFIG,
    dbPath,
    cooldownMs: {
      locationCreate: 0,
      wifiCreate: 0,
      vote: 0,
      report: 0
    }
  };
}

async function createTestDbPath() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wifinder-test-"));
  return {
    dbPath: path.join(tempDir, "wifinder.sqlite"),
    cleanup: async () => fs.rm(tempDir, { recursive: true, force: true })
  };
}

async function withServer(run, { dbPath } = {}) {
  const db = dbPath ? { dbPath, cleanup: async () => {} } : await createTestDbPath();
  const app = createApp({ config: createTestConfig(db.dbPath) });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let deviceToken = null;
  async function request(path, options = {}) {
    const headers = new Headers(options.headers ?? {});
    if (deviceToken) {
      headers.set("x-device-token", deviceToken);
    }
    if (options.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const responseToken = response.headers.get("x-device-token");
    if (responseToken) {
      deviceToken = responseToken;
    }

    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    return { status: response.status, body };
  }

  try {
    await run({ request, app, dbPath: db.dbPath });
  } finally {
    await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
    await db.cleanup();
  }
}

test("health endpoint returns service metadata and issues token", async () => {
  await withServer(async ({ request }) => {
    const response = await request("/health");
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "ok");
    assert.ok(response.body.data_counts.locations >= 1);
  });
});

test("create/read location flow supports nearby and search", async () => {
  await withServer(async ({ request }) => {
    const createResponse = await request("/api/locations", {
      method: "POST",
      body: {
        name: "Shoreditch Cowork",
        category: "coworking",
        lat: 51.5255,
        lng: -0.076,
        address: "Old St, London"
      }
    });
    assert.equal(createResponse.status, 201);
    const newId = createResponse.body.location.id;

    const nearby = await request(
      `/api/locations/nearby?lat=${encodeURIComponent("51.5255")}&lng=${encodeURIComponent("-0.076")}&radius=1200`
    );
    assert.equal(nearby.status, 200);
    assert.ok(nearby.body.locations.some((location) => location.id === newId));

    const search = await request("/api/locations/search?q=shoreditch&lat=51.5255&lng=-0.076&radius=5000");
    assert.equal(search.status, 200);
    assert.ok(search.body.locations.some((location) => location.id === newId));

    const location = await request(`/api/locations/${newId}`);
    assert.equal(location.status, 200);
    assert.equal(location.body.location.name, "Shoreditch Cowork");
  });
});

test("wifi detail votes enforce one active vote per token", async () => {
  await withServer(async ({ request }) => {
    const createLocation = await request("/api/locations", {
      method: "POST",
      body: {
        name: "Canary Hub",
        category: "cafe",
        lat: 51.5045,
        lng: -0.0195
      }
    });
    assert.equal(createLocation.status, 201);
    const locationId = createLocation.body.location.id;

    const createWifi = await request(`/api/locations/${locationId}/wifi-details`, {
      method: "POST",
      body: {
        ssid: "CanaryGuest",
        access_notes: "Token is on receipt"
      }
    });
    assert.equal(createWifi.status, 201);
    const wifiDetailId = createWifi.body.wifi_detail.id;

    const firstVote = await request(`/api/wifi-details/${wifiDetailId}/votes`, {
      method: "POST",
      body: { vote_type: "works" }
    });
    assert.equal(firstVote.status, 200);
    assert.equal(firstVote.body.summary.works, 1);
    assert.equal(firstVote.body.summary.does_not_work, 0);

    const changedVote = await request(`/api/wifi-details/${wifiDetailId}/votes`, {
      method: "POST",
      body: { vote_type: "does_not_work" }
    });
    assert.equal(changedVote.status, 200);
    assert.equal(changedVote.body.summary.works, 0);
    assert.equal(changedVote.body.summary.does_not_work, 1);
    assert.equal(changedVote.body.summary.total_votes, 1);

    const summary = await request(`/api/wifi-details/${wifiDetailId}/summary`);
    assert.equal(summary.status, 200);
    assert.equal(summary.body.summary.total_votes, 1);
  });
});

test("data persists across app restarts with the same database path", async () => {
  const { dbPath, cleanup } = await createTestDbPath();

  try {
    let persistedLocationId;
    let persistedWifiDetailId;

    await withServer(
      async ({ request }) => {
        const createLocation = await request("/api/locations", {
          method: "POST",
          body: {
            name: "Persistence Cafe",
            category: "cafe",
            lat: 51.5007,
            lng: -0.1246,
            address: "Westminster, London"
          }
        });
        assert.equal(createLocation.status, 201);
        persistedLocationId = createLocation.body.location.id;

        const createWifi = await request(`/api/locations/${persistedLocationId}/wifi-details`, {
          method: "POST",
          body: {
            ssid: "PersistentGuest",
            password: "daily-pass",
            purchase_required: true
          }
        });
        assert.equal(createWifi.status, 201);
        persistedWifiDetailId = createWifi.body.wifi_detail.id;

        const vote = await request(`/api/wifi-details/${persistedWifiDetailId}/votes`, {
          method: "POST",
          body: { vote_type: "works" }
        });
        assert.equal(vote.status, 200);
      },
      { dbPath }
    );

    await withServer(
      async ({ request }) => {
        const location = await request(`/api/locations/${persistedLocationId}`);
        assert.equal(location.status, 200);
        assert.equal(location.body.location.name, "Persistence Cafe");
        assert.equal(location.body.location.wifi_details.length, 1);
        assert.equal(location.body.location.wifi_details[0].ssid, "PersistentGuest");
        assert.equal(location.body.location.wifi_details[0].purchase_required, true);
        assert.equal(location.body.location.wifi_details[0].summary.works, 1);

        const summary = await request(`/api/wifi-details/${persistedWifiDetailId}/summary`);
        assert.equal(summary.status, 200);
        assert.equal(summary.body.summary.total_votes, 1);
      },
      { dbPath }
    );
  } finally {
    await cleanup();
  }
});
