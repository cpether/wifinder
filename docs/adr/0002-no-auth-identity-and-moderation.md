# ADR 0002: No-Auth Identity and Moderation Model

- Date: 2026-02-20
- Status: Accepted

## Context
Product scope requires no user authentication in MVP while still supporting:
- one active vote per device/session token,
- rate limiting and cooldown controls,
- abuse reporting and moderation auditability.

## Decision
Adopt an anonymous token model with request controls:
- Device/session token issued and rotated by the API.
- Token hash (not raw token) stored for vote and report linkage.
- Rate limiting keyed by IP + token hash.
- Cooldown enforcement for repeated writes on the same entity.
- Request-level audit log events for all API calls.

## Consequences
- Pros:
  - Meets MVP no-auth requirement.
  - Preserves user anonymity while enabling anti-abuse controls.
  - Provides operational traces needed for moderation and incident analysis.
- Cons:
  - Strong moderation tooling remains critical because content is immediately public.
  - Token/IP controls are weaker than authenticated reputation systems and need tight thresholds.
