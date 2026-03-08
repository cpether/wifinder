import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/server.js";
import { CONFIG } from "../src/config.js";
import { seedDatabase } from "../src/db/seed.js";

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
    const contentType = response.headers.get("content-type") ?? "";
    const body =
      !options.raw && contentType.includes("application/json") && text ? JSON.parse(text) : text;

    return { status: response.status, body, contentType };
  }

  try {
    await run({ request, app, dbPath: db.dbPath });
  } finally {
    await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
    await db.cleanup();
  }
}

async function seedTestDatabase(dbPath) {
  seedDatabase({ dbPath });
}

function assertLocationSummaryShape(location) {
  assert.equal(typeof location.id, "number");
  assert.equal(typeof location.name, "string");
  assert.equal(typeof location.category, "string");
  assert.equal(typeof location.distance_m, "number");
  assert.equal(typeof location.wifi_confidence, "number");
  assert.ok(location.last_verified_at === null || typeof location.last_verified_at === "string");
  assert.ok(
    location.freshness_badge === "Verified recently" ||
      location.freshness_badge === "Aging" ||
      location.freshness_badge === "Unknown" ||
      location.freshness_badge === "Stale"
  );
  assert.equal("wifi_details" in location, false);
}

test("web shell route serves the mobile map/list app and static assets", async () => {
  await withServer(async ({ request }) => {
    const home = await request("/", { raw: true });
    assert.equal(home.status, 200);
    assert.match(home.contentType, /^text\/html/);
    assert.match(home.body, /Use my location/);
    assert.match(home.body, /Browse by map or list/);
    assert.match(home.body, /Search by place, street, postcode, or area/);
    assert.match(home.body, /id="search-input"/);
    assert.match(home.body, /id="category-input"/);
    assert.match(home.body, /id="radius-select"/);
    assert.match(home.body, /id="verified-only"/);
    assert.match(home.body, /"nearbyEndpoint":"\/api\/locations\/nearby"/);
    assert.match(home.body, /"searchEndpoint":"\/api\/locations\/search"/);
    assert.match(home.body, /"radiusOptions":\[500,1000,2000,5000,10000\]/);
    assert.match(home.body, /"googleMapsApiKey":null/);

    const css = await request("/assets/app.css", { raw: true });
    assert.equal(css.status, 200);
    assert.match(css.contentType, /^text\/css/);
    assert.match(css.body, /\.filter-grid/);

    const js = await request("/assets/app.js", { raw: true });
    assert.equal(js.status, 200);
    assert.match(js.contentType, /^application\/javascript/);
    assert.match(js.body, /scheduleTypedSearch/);
  });
});

test("health endpoint returns service metadata and issues token", async () => {
  await withServer(async ({ request }) => {
    const response = await request("/health");
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "ok");
    assert.equal(response.body.data_counts.locations, 0);
    assert.equal(response.body.data_counts.wifi_details, 0);
  });
});

test("explicit seed setup populates demo data without boot-time mutation", async () => {
  const { dbPath, cleanup } = await createTestDbPath();

  try {
    await seedTestDatabase(dbPath);

    await withServer(
      async ({ request }) => {
        const health = await request("/health");
        assert.equal(health.status, 200);
        assert.equal(health.body.data_counts.locations, 1);
        assert.equal(health.body.data_counts.wifi_details, 1);

        const nearby = await request("/api/locations/nearby?lat=51.5079&lng=-0.1283&radius=500");
        assert.equal(nearby.status, 200);
        assert.equal(nearby.body.locations.length, 1);
        assert.equal(nearby.body.locations[0].name, "Central Library Cafe");
      },
      { dbPath }
    );
  } finally {
    await cleanup();
  }
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
    const nearbyLocation = nearby.body.locations.find((location) => location.id === newId);
    assert.ok(nearbyLocation);
    assertLocationSummaryShape(nearbyLocation);

    const search = await request("/api/locations/search?q=shoreditch&lat=51.5255&lng=-0.076&radius=5000");
    assert.equal(search.status, 200);
    const searchedLocation = search.body.locations.find((location) => location.id === newId);
    assert.ok(searchedLocation);
    assertLocationSummaryShape(searchedLocation);

    const location = await request(`/api/locations/${newId}`);
    assert.equal(location.status, 200);
    assert.equal(location.body.location.name, "Shoreditch Cowork");
    assert.ok(Array.isArray(location.body.location.wifi_details));
    assert.equal(location.body.location.wifi_details.length, 0);
  });
});

test("search supports query-only requests before a nearby center is chosen", async () => {
  await withServer(async ({ request }) => {
    const alphaResponse = await request("/api/locations", {
      method: "POST",
      body: {
        name: "Camden Laptop Club",
        category: "coworking",
        lat: 51.5416,
        lng: -0.142,
        address: "Camden High Street, London"
      }
    });
    assert.equal(alphaResponse.status, 201);

    const betaResponse = await request("/api/locations", {
      method: "POST",
      body: {
        name: "Brixton Beans",
        category: "cafe",
        lat: 51.4613,
        lng: -0.1156,
        address: "Atlantic Road, London"
      }
    });
    assert.equal(betaResponse.status, 201);

    const search = await request("/api/locations/search?q=camden");
    assert.equal(search.status, 200);
    assert.equal(search.body.locations.length, 1);
    assert.equal(search.body.locations[0].name, "Camden Laptop Club");
    assert.equal(search.body.locations[0].distance_m, null);
    assert.equal(search.body.locations[0].address, "Camden High Street, London");
  });
});

test("search and nearby filters apply category, radius, and verified state", async () => {
  await withServer(async ({ request }) => {
    const verifiedCafe = await request("/api/locations", {
      method: "POST",
      body: {
        name: "Filter Verified Cafe",
        category: "cafe",
        lat: 51.5008,
        lng: -0.1257,
        address: "Victoria Embankment, London"
      }
    });
    assert.equal(verifiedCafe.status, 201);

    const verifiedWifi = await request(`/api/locations/${verifiedCafe.body.location.id}/wifi-details`, {
      method: "POST",
      body: {
        ssid: "VerifiedCafeGuest"
      }
    });
    assert.equal(verifiedWifi.status, 201);

    const vote = await request(`/api/wifi-details/${verifiedWifi.body.wifi_detail.id}/votes`, {
      method: "POST",
      body: { vote_type: "works" }
    });
    assert.equal(vote.status, 200);

    const staleCafe = await request("/api/locations", {
      method: "POST",
      body: {
        name: "Filter Stale Cafe",
        category: "cafe",
        lat: 51.5012,
        lng: -0.1261,
        address: "Northumberland Avenue, London"
      }
    });
    assert.equal(staleCafe.status, 201);

    const staleWifi = await request(`/api/locations/${staleCafe.body.location.id}/wifi-details`, {
      method: "POST",
      body: {
        ssid: "StaleCafeGuest"
      }
    });
    assert.equal(staleWifi.status, 201);

    const library = await request("/api/locations", {
      method: "POST",
      body: {
        name: "Filter Library",
        category: "library",
        lat: 51.5071,
        lng: -0.1279,
        address: "Trafalgar Square, London"
      }
    });
    assert.equal(library.status, 201);

    const nearby = await request("/api/locations/nearby?lat=51.5008&lng=-0.1257&radius=500&category=CaFe");
    assert.equal(nearby.status, 200);
    assert.deepEqual(
      nearby.body.locations.map((location) => location.name),
      ["Filter Verified Cafe", "Filter Stale Cafe"]
    );

    const filteredSearch = await request(
      "/api/locations/search?lat=51.5008&lng=-0.1257&radius=600&category=CAFE&verified=true"
    );
    assert.equal(filteredSearch.status, 200);
    assert.deepEqual(
      filteredSearch.body.locations.map((location) => location.name),
      ["Filter Verified Cafe"]
    );
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

test("nearby summaries expose last verified metadata for location cards", async () => {
  await withServer(async ({ request }) => {
    const createLocation = await request("/api/locations", {
      method: "POST",
      body: {
        name: "Verified Cafe",
        category: "cafe",
        lat: 51.501,
        lng: -0.1416,
        address: "St James's, London"
      }
    });
    assert.equal(createLocation.status, 201);

    const createWifi = await request(`/api/locations/${createLocation.body.location.id}/wifi-details`, {
      method: "POST",
      body: {
        ssid: "VerifiedGuest"
      }
    });
    assert.equal(createWifi.status, 201);

    const vote = await request(`/api/wifi-details/${createWifi.body.wifi_detail.id}/votes`, {
      method: "POST",
      body: { vote_type: "works" }
    });
    assert.equal(vote.status, 200);

    const nearby = await request("/api/locations/nearby?lat=51.501&lng=-0.1416&radius=1200");
    assert.equal(nearby.status, 200);

    const location = nearby.body.locations.find((item) => item.id === createLocation.body.location.id);
    assert.ok(location);
    assert.equal(typeof location.last_verified_at, "string");
    assert.equal(location.freshness_badge, "Verified recently");
  });
});

test("report submission returns stable shape and increments report counts", async () => {
  await withServer(async ({ request }) => {
    const healthBefore = await request("/health");
    assert.equal(healthBefore.status, 200);
    const reportsBefore = healthBefore.body.data_counts.reports;

    const createdLocation = await request("/api/locations", {
      method: "POST",
      body: {
        name: "Reportable Cafe",
        category: "cafe",
        lat: 51.509,
        lng: -0.1357
      }
    });
    assert.equal(createdLocation.status, 201);

    const createdWifiDetail = await request(`/api/locations/${createdLocation.body.location.id}/wifi-details`, {
      method: "POST",
      body: {
        ssid: "ReportableGuest"
      }
    });
    assert.equal(createdWifiDetail.status, 201);

    const reportResponse = await request("/api/reports", {
      method: "POST",
      body: {
        target_type: "wifi_detail",
        target_id: createdWifiDetail.body.wifi_detail.id,
        reason: " Password is outdated "
      }
    });
    assert.equal(reportResponse.status, 201);
    assert.equal(typeof reportResponse.body.report.id, "number");
    assert.equal(reportResponse.body.report.target_type, "wifi_detail");
    assert.equal(reportResponse.body.report.target_id, createdWifiDetail.body.wifi_detail.id);
    assert.equal(reportResponse.body.report.reason, "Password is outdated");
    assert.equal(reportResponse.body.report.status, "open");
    assert.equal(typeof reportResponse.body.report.created_at, "string");
    assert.equal(typeof reportResponse.body.report.reporter_token_hash, "string");

    const healthAfter = await request("/health");
    assert.equal(healthAfter.status, 200);
    assert.equal(healthAfter.body.data_counts.reports, reportsBefore + 1);
  });
});

test("validation and missing-resource errors keep a stable error envelope", async () => {
  await withServer(async ({ request }) => {
    const invalidVote = await request("/api/wifi-details/99999/votes", {
      method: "POST",
      body: {
        vote_type: "bad_value"
      }
    });
    assert.equal(invalidVote.status, 400);
    assert.deepEqual(Object.keys(invalidVote.body), ["error"]);
    assert.equal(invalidVote.body.error.message, "vote_type must be works or does_not_work");
    assert.equal("details" in invalidVote.body.error, false);

    const missingLocationWifi = await request("/api/locations/99999/wifi-details", {
      method: "POST",
      body: {
        ssid: "MissingPlaceWifi"
      }
    });
    assert.equal(missingLocationWifi.status, 404);
    assert.deepEqual(Object.keys(missingLocationWifi.body), ["error"]);
    assert.equal(missingLocationWifi.body.error.message, "Location not found");
    assert.equal("details" in missingLocationWifi.body.error, false);

    const invalidReport = await request("/api/reports", {
      method: "POST",
      body: {
        target_type: "other",
        target_id: 1,
        reason: "Nope"
      }
    });
    assert.equal(invalidReport.status, 400);
    assert.deepEqual(Object.keys(invalidReport.body), ["error"]);
    assert.equal(invalidReport.body.error.message, "target_type must be location or wifi_detail");
    assert.equal("details" in invalidReport.body.error, false);
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
