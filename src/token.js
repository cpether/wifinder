import crypto from "node:crypto";

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generateTokenValue() {
  return crypto.randomBytes(24).toString("base64url");
}

export function createTokenManager({ tokenTtlMs, tokenRotateMs }) {
  const issuedTokens = new Map();

  function issueToken(nowMs = Date.now()) {
    const value = generateTokenValue();
    issuedTokens.set(value, {
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + tokenTtlMs
    });
    return value;
  }

  function getOrCreateToken(existingToken, nowMs = Date.now()) {
    if (!existingToken) {
      return { token: issueToken(nowMs), rotated: true };
    }

    const record = issuedTokens.get(existingToken);
    if (!record || record.expiresAtMs <= nowMs) {
      issuedTokens.delete(existingToken);
      return { token: issueToken(nowMs), rotated: true };
    }

    const shouldRotate = nowMs - record.updatedAtMs >= tokenRotateMs;
    if (shouldRotate) {
      issuedTokens.delete(existingToken);
      return { token: issueToken(nowMs), rotated: true };
    }

    record.updatedAtMs = nowMs;
    return { token: existingToken, rotated: false };
  }

  return {
    getOrCreateToken,
    hashToken(token) {
      return hashValue(token);
    }
  };
}
