import { summarizeVotes } from "./confidence.js";
import { distanceMeters } from "./geo.js";

export function createStore() {
  const locations = [];
  const wifiDetails = [];
  const wifiVotes = [];
  const reports = [];
  const moderationActions = [];

  let locationIdCounter = 1;
  let wifiDetailIdCounter = 1;
  let voteIdCounter = 1;
  let reportIdCounter = 1;

  function nowIso() {
    return new Date().toISOString();
  }

  function seed() {
    const now = nowIso();
    const seededLocation = {
      id: locationIdCounter++,
      name: "Central Library Cafe",
      category: "cafe",
      lat: 51.5079,
      lng: -0.1283,
      address: "Trafalgar Sq, London",
      notes: "Large seating area",
      place_source: "seed",
      created_at: now,
      status: "active"
    };
    locations.push(seededLocation);

    const seededWifi = {
      id: wifiDetailIdCounter++,
      location_id: seededLocation.id,
      ssid: "LibraryGuest",
      password: null,
      access_notes: "Ask staff for current daily code.",
      time_limits: null,
      purchase_required: false,
      created_at: now,
      status: "active"
    };
    wifiDetails.push(seededWifi);
  }

  seed();

  function getLocationWithComputedFields(location) {
    const locationWifi = wifiDetails.filter(
      (detail) => detail.location_id === location.id && detail.status === "active"
    );
    const summaries = locationWifi.map((detail) => {
      const votes = wifiVotes.filter((vote) => vote.wifi_detail_id === detail.id);
      return summarizeVotes(votes);
    });

    const aggregate = summaries.length
      ? {
          wifi_confidence: Math.round(
            summaries.reduce((sum, summary) => sum + summary.confidence, 0) / summaries.length
          ),
          last_verified_at:
            summaries.map((summary) => summary.last_verified_at).filter(Boolean).sort().at(-1) ?? null,
          freshness_badge: summaries.some((summary) => summary.freshness_badge === "Verified recently")
            ? "Verified recently"
            : summaries.some((summary) => summary.freshness_badge === "Aging")
              ? "Aging"
              : summaries.some((summary) => summary.freshness_badge === "Unknown")
                ? "Unknown"
                : "Stale"
        }
      : {
          wifi_confidence: 0,
          freshness_badge: "Unknown",
          last_verified_at: null
        };

    return {
      ...location,
      ...aggregate
    };
  }

  return {
    health() {
      return {
        status: "ok",
        now: nowIso(),
        data_counts: {
          locations: locations.length,
          wifi_details: wifiDetails.length,
          wifi_votes: wifiVotes.length,
          reports: reports.length,
          moderation_actions: moderationActions.length
        }
      };
    },

    listNearby({ lat, lng, radius, category }) {
      return locations
        .filter((location) => location.status === "active")
        .map((location) => {
          const distance = distanceMeters(lat, lng, location.lat, location.lng);
          return { location, distance };
        })
        .filter(({ location, distance }) => {
          if (distance > radius) {
            return false;
          }
          if (category && location.category !== category) {
            return false;
          }
          return true;
        })
        .sort((a, b) => a.distance - b.distance)
        .map(({ location, distance }) => ({
          ...getLocationWithComputedFields(location),
          distance_m: Math.round(distance)
        }));
    },

    search({ q, lat, lng, radius, category, verified }) {
      const normalizedQuery = q ? q.toLowerCase() : null;
      const hasCenter = Number.isFinite(lat) && Number.isFinite(lng);

      return locations
        .filter((location) => location.status === "active")
        .map((location) => {
          const enriched = getLocationWithComputedFields(location);
          const distance = hasCenter ? distanceMeters(lat, lng, location.lat, location.lng) : null;

          const textBlob = `${location.name} ${location.address ?? ""} ${location.category}`.toLowerCase();
          const textScore = normalizedQuery
            ? textBlob.includes(normalizedQuery)
              ? 100
              : normalizedQuery
                  .split(/\s+/)
                  .filter(Boolean)
                  .reduce((score, token) => score + (textBlob.includes(token) ? 20 : 0), 0)
            : 0;

          const distanceScore =
            hasCenter && distance !== null ? Math.max(0, 100 - Math.round(distance / 50)) : 0;

          const totalScore = textScore + enriched.wifi_confidence + distanceScore;
          return { enriched, distance, totalScore };
        })
        .filter(({ enriched, distance }) => {
          if (normalizedQuery) {
            const textBlob = `${enriched.name} ${enriched.address ?? ""} ${enriched.category}`.toLowerCase();
            if (!textBlob.includes(normalizedQuery) && !normalizedQuery.split(/\s+/).some((token) => textBlob.includes(token))) {
              return false;
            }
          }
          if (category && enriched.category !== category) {
            return false;
          }
          if (verified && enriched.freshness_badge !== "Verified recently") {
            return false;
          }
          if (hasCenter && distance !== null && distance > radius) {
            return false;
          }
          return true;
        })
        .sort((a, b) => b.totalScore - a.totalScore)
        .map(({ enriched, distance }) => ({
          ...enriched,
          distance_m: distance === null ? null : Math.round(distance)
        }));
    },

    getLocationById(id) {
      const location = locations.find((item) => item.id === id && item.status === "active");
      if (!location) {
        return null;
      }

      const details = wifiDetails
        .filter((detail) => detail.location_id === id && detail.status === "active")
        .map((detail) => ({
          ...detail,
          summary: summarizeVotes(wifiVotes.filter((vote) => vote.wifi_detail_id === detail.id))
        }));

      return {
        ...getLocationWithComputedFields(location),
        wifi_details: details
      };
    },

    createLocation(payload) {
      const location = {
        id: locationIdCounter++,
        name: payload.name,
        category: payload.category,
        lat: payload.lat,
        lng: payload.lng,
        address: payload.address ?? null,
        notes: payload.notes ?? null,
        place_source: payload.place_source ?? "user_submission",
        created_at: nowIso(),
        status: "active"
      };
      locations.push(location);
      return getLocationWithComputedFields(location);
    },

    createWifiDetail(locationId, payload) {
      const location = locations.find((item) => item.id === locationId && item.status === "active");
      if (!location) {
        return null;
      }

      const detail = {
        id: wifiDetailIdCounter++,
        location_id: locationId,
        ssid: payload.ssid,
        password: payload.password ?? null,
        access_notes: payload.access_notes ?? null,
        time_limits: payload.time_limits ?? null,
        purchase_required: payload.purchase_required ?? false,
        created_at: nowIso(),
        status: "active"
      };
      wifiDetails.push(detail);
      return detail;
    },

    upsertVote({ wifiDetailId, voterTokenHash, voteType }) {
      const wifiDetail = wifiDetails.find((item) => item.id === wifiDetailId && item.status === "active");
      if (!wifiDetail) {
        return null;
      }

      const now = nowIso();
      const existingVote = wifiVotes.find(
        (vote) => vote.wifi_detail_id === wifiDetailId && vote.voter_token_hash === voterTokenHash
      );

      if (existingVote) {
        existingVote.vote_type = voteType;
        existingVote.updated_at = now;
        return existingVote;
      }

      const vote = {
        id: voteIdCounter++,
        wifi_detail_id: wifiDetailId,
        voter_token_hash: voterTokenHash,
        vote_type: voteType,
        created_at: now,
        updated_at: now
      };
      wifiVotes.push(vote);
      return vote;
    },

    getWifiSummary(wifiDetailId) {
      const wifiDetail = wifiDetails.find((item) => item.id === wifiDetailId && item.status === "active");
      if (!wifiDetail) {
        return null;
      }
      return summarizeVotes(wifiVotes.filter((vote) => vote.wifi_detail_id === wifiDetailId));
    },

    createReport(payload) {
      const report = {
        id: reportIdCounter++,
        target_type: payload.target_type,
        target_id: payload.target_id,
        reason: payload.reason,
        reporter_token_hash: payload.reporter_token_hash,
        created_at: nowIso(),
        status: "open"
      };
      reports.push(report);
      return report;
    }
  };
}
