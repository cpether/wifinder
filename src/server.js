import http from "node:http";
import { CONFIG } from "./config.js";
import { createAuditLog } from "./audit-log.js";
import { createStore } from "./db.js";
import { HttpError, isHttpError } from "./errors.js";
import { getClientIp, json, readJsonBody } from "./http.js";
import { createRateLimiter } from "./rate-limit.js";
import { createTokenManager } from "./token.js";
import {
  validateCreateLocation,
  validateCreateWifiDetail,
  validateNearbyQuery,
  validateReport,
  validateSearchQuery,
  validateVote
} from "./validation.js";

function toId(value, fieldName) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, `Invalid ${fieldName}`);
  }
  return id;
}

function extractDeviceToken(headerValue) {
  return typeof headerValue === "string" && headerValue.length > 0 ? headerValue : undefined;
}

export function createApp(dependencies = {}) {
  const config = dependencies.config ?? CONFIG;
  const store = dependencies.store ?? createStore({ dbPath: config.dbPath });
  const tokenManager =
    dependencies.tokenManager ??
    createTokenManager({ tokenTtlMs: config.tokenTtlMs, tokenRotateMs: config.tokenRotateMs });
  const rateLimiter = dependencies.rateLimiter ?? createRateLimiter(config);
  const auditLog = dependencies.auditLog ?? createAuditLog();

  const server = http.createServer(async (req, res) => {
    const startedAtMs = Date.now();
    const ip = getClientIp(req);
    const tokenState = tokenManager.getOrCreateToken(extractDeviceToken(req.headers["x-device-token"]));
    const tokenHash = tokenManager.hashToken(tokenState.token);
    const responseHeaders = { "x-device-token": tokenState.token };

    let statusCode = 500;
    try {
      const method = req.method ?? "GET";
      const requestUrl = new URL(req.url ?? "/", "http://localhost");

      if (method === "GET") {
        rateLimiter.enforceWindowLimit({ ip, tokenHash, action: "read" });
      }

      if (method === "GET" && requestUrl.pathname === "/health") {
        statusCode = 200;
        json(res, statusCode, store.health(), responseHeaders);
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/api/locations/nearby") {
        const query = Object.fromEntries(requestUrl.searchParams.entries());
        const validated = validateNearbyQuery(query);
        const locations = store.listNearby(validated);
        statusCode = 200;
        json(res, statusCode, { locations }, responseHeaders);
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/api/locations/search") {
        const query = Object.fromEntries(requestUrl.searchParams.entries());
        const validated = validateSearchQuery(query);
        const locations = store.search(validated);
        statusCode = 200;
        json(res, statusCode, { locations }, responseHeaders);
        return;
      }

      const locationMatch = requestUrl.pathname.match(/^\/api\/locations\/(\d+)$/);
      if (method === "GET" && locationMatch) {
        const location = store.getLocationById(toId(locationMatch[1], "location id"));
        if (!location) {
          throw new HttpError(404, "Location not found");
        }
        statusCode = 200;
        json(res, statusCode, { location }, responseHeaders);
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/api/locations") {
        rateLimiter.enforceWindowLimit({ ip, tokenHash, action: "write" });
        const body = await readJsonBody(req);
        const payload = validateCreateLocation(body);
        rateLimiter.enforceCooldown({
          ip,
          tokenHash,
          entityKey: `location:create:${payload.name.toLowerCase()}:${payload.lat}:${payload.lng}`,
          cooldownMs: config.cooldownMs.locationCreate
        });

        const location = store.createLocation(payload);
        statusCode = 201;
        json(res, statusCode, { location }, responseHeaders);
        return;
      }

      const wifiCreateMatch = requestUrl.pathname.match(/^\/api\/locations\/(\d+)\/wifi-details$/);
      if (method === "POST" && wifiCreateMatch) {
        rateLimiter.enforceWindowLimit({ ip, tokenHash, action: "write" });
        const locationId = toId(wifiCreateMatch[1], "location id");
        rateLimiter.enforceCooldown({
          ip,
          tokenHash,
          entityKey: `wifi:create:${locationId}`,
          cooldownMs: config.cooldownMs.wifiCreate
        });

        const body = await readJsonBody(req);
        const payload = validateCreateWifiDetail(body);
        const wifiDetail = store.createWifiDetail(locationId, payload);
        if (!wifiDetail) {
          throw new HttpError(404, "Location not found");
        }
        statusCode = 201;
        json(res, statusCode, { wifi_detail: wifiDetail }, responseHeaders);
        return;
      }

      const voteMatch = requestUrl.pathname.match(/^\/api\/wifi-details\/(\d+)\/votes$/);
      if (method === "POST" && voteMatch) {
        rateLimiter.enforceWindowLimit({ ip, tokenHash, action: "vote" });
        const wifiDetailId = toId(voteMatch[1], "wifi detail id");
        rateLimiter.enforceCooldown({
          ip,
          tokenHash,
          entityKey: `wifi:vote:${wifiDetailId}`,
          cooldownMs: config.cooldownMs.vote
        });

        const body = await readJsonBody(req);
        const payload = validateVote(body);
        const vote = store.upsertVote({
          wifiDetailId,
          voterTokenHash: tokenHash,
          voteType: payload.vote_type
        });
        if (!vote) {
          throw new HttpError(404, "Wi-Fi detail not found");
        }

        const summary = store.getWifiSummary(wifiDetailId);
        statusCode = 200;
        json(res, statusCode, { vote, summary }, responseHeaders);
        return;
      }

      const wifiSummaryMatch = requestUrl.pathname.match(/^\/api\/wifi-details\/(\d+)\/summary$/);
      if (method === "GET" && wifiSummaryMatch) {
        const wifiDetailId = toId(wifiSummaryMatch[1], "wifi detail id");
        const summary = store.getWifiSummary(wifiDetailId);
        if (!summary) {
          throw new HttpError(404, "Wi-Fi detail not found");
        }
        statusCode = 200;
        json(res, statusCode, { summary }, responseHeaders);
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/api/reports") {
        rateLimiter.enforceWindowLimit({ ip, tokenHash, action: "write" });
        const body = await readJsonBody(req);
        const payload = validateReport(body);
        rateLimiter.enforceCooldown({
          ip,
          tokenHash,
          entityKey: `report:${payload.target_type}:${payload.target_id}`,
          cooldownMs: config.cooldownMs.report
        });

        const report = store.createReport({
          ...payload,
          reporter_token_hash: tokenHash
        });
        statusCode = 201;
        json(res, statusCode, { report }, responseHeaders);
        return;
      }

      throw new HttpError(404, "Not found");
    } catch (error) {
      if (isHttpError(error)) {
        statusCode = error.statusCode;
        json(
          res,
          statusCode,
          { error: { message: error.message, details: error.details } },
          responseHeaders
        );
      } else {
        statusCode = 500;
        json(res, statusCode, { error: { message: "Internal server error" } }, responseHeaders);
      }
    } finally {
      auditLog.record({
        method: req.method ?? "GET",
        path: req.url ?? "/",
        status_code: statusCode,
        ip,
        token_hash: tokenHash,
        duration_ms: Date.now() - startedAtMs
      });
    }
  });

  return {
    server,
    store,
    auditLog
  };
}
