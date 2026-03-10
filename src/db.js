import { nowIso, createDbClient } from "./db/client.js";
import { runMigrations } from "./db/migrations.js";
import { createHealthRepository } from "./db/repositories/health-repository.js";
import { createLocationsRepository } from "./db/repositories/locations-repository.js";
import { createReportsRepository } from "./db/repositories/reports-repository.js";
import { createVotesRepository } from "./db/repositories/votes-repository.js";
import { createWifiDetailsRepository } from "./db/repositories/wifi-details-repository.js";
import { createLocationService } from "./services/location-service.js";
import { createWifiService } from "./services/wifi-service.js";

export function createStore({ dbPath = "data/wifinder.sqlite" } = {}) {
  const db = createDbClient({ dbPath });

  runMigrations(db);

  const healthRepository = createHealthRepository({ db });
  const locationsRepository = createLocationsRepository({ db });
  const wifiDetailsRepository = createWifiDetailsRepository({ db });
  const votesRepository = createVotesRepository({ db });
  const reportsRepository = createReportsRepository({ db });

  const locationService = createLocationService({
    locationsRepository,
    wifiDetailsRepository,
    votesRepository
  });
  const wifiService = createWifiService({
    locationsRepository,
    wifiDetailsRepository,
    votesRepository
  });

  return {
    health() {
      return {
        status: "ok",
        now: nowIso(),
        data_counts: healthRepository.getCounts()
      };
    },

    listNearby(query) {
      return locationService.listNearby(query);
    },

    search(query) {
      return locationService.search(query);
    },

    getLocationById(id) {
      return locationService.getLocationById(id);
    },

    createLocation(payload, options) {
      return locationService.createLocation(payload, options);
    },

    createWifiDetail(locationId, payload) {
      return wifiService.createWifiDetail(locationId, payload);
    },

    upsertVote(payload) {
      return wifiService.upsertVote(payload);
    },

    getWifiSummary(wifiDetailId) {
      return wifiService.getWifiSummary(wifiDetailId);
    },

    createReport(payload) {
      return reportsRepository.create(payload);
    }
  };
}
