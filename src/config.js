export const CONFIG = {
  tokenTtlMs: 1000 * 60 * 60 * 24 * 30,
  tokenRotateMs: 1000 * 60 * 60 * 12,
  rateLimits: {
    read: { windowMs: 60_000, max: 120 },
    write: { windowMs: 60_000, max: 30 },
    vote: { windowMs: 60_000, max: 20 }
  },
  cooldownMs: {
    locationCreate: 10_000,
    wifiCreate: 10_000,
    vote: 5_000,
    report: 5_000
  }
};
