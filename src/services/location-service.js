import { summarizeLocation, summarizeVotes } from "../confidence.js";
import { distanceMeters } from "../geo.js";

const DUPLICATE_DISTANCE_THRESHOLD_METERS = 150;
const DUPLICATE_NAME_SIMILARITY_THRESHOLD = 0.6;

function hydrateLocations(locations, wifiDetailsRepository, votesRepository) {
  const wifiDetails = wifiDetailsRepository.listActiveByLocationIds(
    locations.map((location) => location.id)
  );
  const votes = votesRepository.listByWifiDetailIds(wifiDetails.map((detail) => detail.id));

  const votesByWifiDetailId = new Map();
  for (const vote of votes) {
    const grouped = votesByWifiDetailId.get(vote.wifi_detail_id) ?? [];
    grouped.push(vote);
    votesByWifiDetailId.set(vote.wifi_detail_id, grouped);
  }

  const wifiDetailsByLocationId = new Map();
  for (const detail of wifiDetails) {
    const enrichedDetail = {
      ...detail,
      summary: summarizeVotes(votesByWifiDetailId.get(detail.id) ?? [])
    };

    const grouped = wifiDetailsByLocationId.get(detail.location_id) ?? [];
    grouped.push(enrichedDetail);
    wifiDetailsByLocationId.set(detail.location_id, grouped);
  }

  return locations.map((location) => {
    const locationWifiDetails = wifiDetailsByLocationId.get(location.id) ?? [];
    return {
      ...location,
      ...summarizeLocation(locationWifiDetails.map((detail) => detail.summary)),
      wifi_details: locationWifiDetails
    };
  });
}

function toLocationSummary(location, distance) {
  const { wifi_details, ...summaryLocation } = location;
  return {
    ...summaryLocation,
    distance_m: distance === null ? null : Math.round(distance)
  };
}

function normalizeName(value) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

function tokenizeName(value) {
  return normalizeName(value).split(" ").filter(Boolean);
}

function calculateNameSimilarity(left, right) {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return 0.9;
  }

  const leftTokens = tokenizeName(left);
  const rightTokens = tokenizeName(right);
  const rightTokenSet = new Set(rightTokens);
  const overlapCount = leftTokens.filter((token) => rightTokenSet.has(token)).length;
  const unionCount = new Set([...leftTokens, ...rightTokens]).size;

  if (unionCount === 0) {
    return 0;
  }

  return overlapCount / unionCount;
}

function findPotentialDuplicates({ payload, locationsRepository, wifiDetailsRepository, votesRepository }) {
  return hydrateLocations(
    locationsRepository.listActive(),
    wifiDetailsRepository,
    votesRepository
  )
    .map((location) => {
      const distance = distanceMeters(payload.lat, payload.lng, location.lat, location.lng);
      const nameSimilarity = calculateNameSimilarity(payload.name, location.name);

      return {
        location,
        distance,
        nameSimilarity
      };
    })
    .filter(
      ({ distance, nameSimilarity }) =>
        distance <= DUPLICATE_DISTANCE_THRESHOLD_METERS &&
        nameSimilarity >= DUPLICATE_NAME_SIMILARITY_THRESHOLD
    )
    .sort((left, right) => left.distance - right.distance || right.nameSimilarity - left.nameSimilarity)
    .map(({ location, distance, nameSimilarity }) => ({
      ...toLocationSummary(location, distance),
      name_similarity: Number(nameSimilarity.toFixed(2))
    }));
}

export function createLocationService({
  locationsRepository,
  wifiDetailsRepository,
  votesRepository
}) {
  return {
    listNearby({ lat, lng, radius, category }) {
      const normalizedCategory = category ? category.toLowerCase() : null;

      return hydrateLocations(
        locationsRepository.listActive(),
        wifiDetailsRepository,
        votesRepository
      )
        .map((location) => ({
          location,
          distance: distanceMeters(lat, lng, location.lat, location.lng)
        }))
        .filter(({ location, distance }) => {
          if (distance > radius) {
            return false;
          }
          if (normalizedCategory && location.category.toLowerCase() !== normalizedCategory) {
            return false;
          }
          return true;
        })
        .sort((left, right) => left.distance - right.distance)
        .map(({ location, distance }) => toLocationSummary(location, distance));
    },

    search({ q, lat, lng, radius, category, verified }) {
      const normalizedQuery = q ? q.toLowerCase() : null;
      const normalizedCategory = category ? category.toLowerCase() : null;
      const hasCenter = Number.isFinite(lat) && Number.isFinite(lng);

      return hydrateLocations(
        locationsRepository.listActive(),
        wifiDetailsRepository,
        votesRepository
      )
        .map((location) => {
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

          return {
            location,
            distance,
            totalScore: textScore + location.wifi_confidence + distanceScore
          };
        })
        .filter(({ location, distance }) => {
          if (normalizedQuery) {
            const textBlob = `${location.name} ${location.address ?? ""} ${location.category}`.toLowerCase();
            if (
              !textBlob.includes(normalizedQuery) &&
              !normalizedQuery.split(/\s+/).some((token) => textBlob.includes(token))
            ) {
              return false;
            }
          }
          if (normalizedCategory && location.category.toLowerCase() !== normalizedCategory) {
            return false;
          }
          if (verified && location.freshness_badge !== "Verified recently") {
            return false;
          }
          if (hasCenter && distance !== null && distance > radius) {
            return false;
          }
          return true;
        })
        .sort((left, right) => right.totalScore - left.totalScore)
        .map(({ location, distance }) => toLocationSummary(location, distance));
    },

    getLocationById(id) {
      const location = locationsRepository.findActiveById(id);
      if (!location) {
        return null;
      }

      return hydrateLocations([location], wifiDetailsRepository, votesRepository)[0];
    },

    createLocation(payload, { ignoreDuplicateWarning = false } = {}) {
      const potentialDuplicates = findPotentialDuplicates({
        payload,
        locationsRepository,
        wifiDetailsRepository,
        votesRepository
      });

      if (!ignoreDuplicateWarning && potentialDuplicates.length > 0) {
        return {
          location: null,
          duplicates: potentialDuplicates
        };
      }

      return {
        location: {
          ...locationsRepository.create(payload),
          ...summarizeLocation([])
        },
        duplicates: []
      };
    }
  };
}
