import { HttpError } from "./errors.js";

function expectString(value, fieldName, { required = false, maxLength = 200 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new HttpError(400, `Missing required field: ${fieldName}`);
    }
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `Field must be a string: ${fieldName}`);
  }

  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new HttpError(400, `Missing required field: ${fieldName}`);
  }
  if (trimmed.length > maxLength) {
    throw new HttpError(400, `Field too long: ${fieldName}`);
  }
  return trimmed;
}

function expectBoolean(value, fieldName) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new HttpError(400, `Field must be boolean: ${fieldName}`);
  }
  return value;
}

function expectNumber(value, fieldName, { min = -Infinity, max = Infinity, required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new HttpError(400, `Missing required field: ${fieldName}`);
    }
    return undefined;
  }

  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) {
    throw new HttpError(400, `Field must be numeric: ${fieldName}`);
  }
  if (asNumber < min || asNumber > max) {
    throw new HttpError(400, `Field out of range: ${fieldName}`);
  }
  return asNumber;
}

export function validateNearbyQuery(query) {
  return {
    lat: expectNumber(query.lat, "lat", { min: -90, max: 90, required: true }),
    lng: expectNumber(query.lng, "lng", { min: -180, max: 180, required: true }),
    radius: expectNumber(query.radius, "radius", { min: 50, max: 50_000, required: false }) ?? 5_000,
    category: expectString(query.category, "category", { required: false })
  };
}

export function validateSearchQuery(query) {
  return {
    q: expectString(query.q, "q", { required: false, maxLength: 120 }),
    lat: expectNumber(query.lat, "lat", { min: -90, max: 90, required: false }),
    lng: expectNumber(query.lng, "lng", { min: -180, max: 180, required: false }),
    radius: expectNumber(query.radius, "radius", { min: 50, max: 50_000, required: false }) ?? 5_000,
    category: expectString(query.category, "category", { required: false }),
    verified: query.verified === undefined ? undefined : query.verified === "true"
  };
}

export function validateCreateLocation(body) {
  return {
    name: expectString(body.name, "name", { required: true, maxLength: 120 }),
    category: expectString(body.category, "category", { required: true, maxLength: 60 }),
    lat: expectNumber(body.lat, "lat", { min: -90, max: 90, required: true }),
    lng: expectNumber(body.lng, "lng", { min: -180, max: 180, required: true }),
    address: expectString(body.address, "address", { required: false, maxLength: 220 }),
    notes: expectString(body.notes, "notes", { required: false, maxLength: 500 }),
    place_source: expectString(body.place_source, "place_source", { required: false, maxLength: 80 }),
    ignore_duplicate_warning: expectBoolean(body.ignore_duplicate_warning, "ignore_duplicate_warning")
  };
}

export function validateCreateWifiDetail(body) {
  return {
    ssid: expectString(body.ssid, "ssid", { required: true, maxLength: 120 }),
    password: expectString(body.password, "password", { required: false, maxLength: 200 }),
    access_notes: expectString(body.access_notes, "access_notes", { required: false, maxLength: 500 }),
    time_limits: expectString(body.time_limits, "time_limits", { required: false, maxLength: 120 }),
    purchase_required: expectBoolean(body.purchase_required, "purchase_required")
  };
}

export function validateVote(body) {
  const voteType = expectString(body.vote_type, "vote_type", { required: true, maxLength: 40 });
  if (voteType !== "works" && voteType !== "does_not_work") {
    throw new HttpError(400, "vote_type must be works or does_not_work");
  }
  return { vote_type: voteType };
}

export function validateReport(body) {
  const targetType = expectString(body.target_type, "target_type", { required: true, maxLength: 40 });
  if (targetType !== "location" && targetType !== "wifi_detail") {
    throw new HttpError(400, "target_type must be location or wifi_detail");
  }

  return {
    target_type: targetType,
    target_id: expectNumber(body.target_id, "target_id", { min: 1, max: Number.MAX_SAFE_INTEGER, required: true }),
    reason: expectString(body.reason, "reason", { required: true, maxLength: 500 })
  };
}
