import { HttpError } from "./errors.js";

export function createRateLimiter(config) {
  const counters = new Map();
  const cooldowns = new Map();

  function keyFor(ip, tokenHash, action) {
    return `${ip}:${tokenHash}:${action}`;
  }

  function enforceWindowLimit({ ip, tokenHash, action, nowMs = Date.now() }) {
    const windowConfig = config.rateLimits[action];
    if (!windowConfig) {
      return;
    }

    const key = keyFor(ip, tokenHash, action);
    const record = counters.get(key);

    if (!record || nowMs >= record.windowStartMs + windowConfig.windowMs) {
      counters.set(key, { windowStartMs: nowMs, count: 1 });
      return;
    }

    if (record.count >= windowConfig.max) {
      throw new HttpError(429, "Rate limit exceeded");
    }

    record.count += 1;
  }

  function enforceCooldown({ ip, tokenHash, entityKey, cooldownMs, nowMs = Date.now() }) {
    if (!entityKey || !cooldownMs) {
      return;
    }

    const key = `${ip}:${tokenHash}:${entityKey}`;
    const lastActionMs = cooldowns.get(key);
    if (typeof lastActionMs === "number" && nowMs - lastActionMs < cooldownMs) {
      throw new HttpError(429, "Action cooldown active");
    }
    cooldowns.set(key, nowMs);
  }

  return {
    enforceWindowLimit,
    enforceCooldown
  };
}
