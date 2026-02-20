# Environment and Secrets Baseline

- Date: 2026-02-20

## Environments
- `dev`: local API development and integration tests.
- `stage`: pre-release validation with production-like config.
- `prod`: UK launch environment.

## Secrets and Key Management
- API secrets must come from environment variables only.
- Required key for this increment:
  - `PORT` (optional, defaults to `3000`).
- Future keys (reserved):
  - `GOOGLE_MAPS_API_KEY`
  - `MODERATOR_API_KEY`
  - `DATABASE_URL`

## Operational Baseline
- Keep request audit logging enabled for all environments.
- Do not store raw anonymous device tokens in persistence.
- Enforce rate limits/cooldowns consistently across write endpoints.
