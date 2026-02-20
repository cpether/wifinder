# WiFinder Implementation Plan (Milestones + Cost)

## Document Status
- Version: v1
- Date: 2026-02-20
- Linked spec: `specs/wifinder-product-spec.md`

## Current Execution Tracker
- 2026-02-20 finding: repository has no `src/*` implementation files yet, so all milestones are currently unimplemented.
- 2026-02-20 resolved: Milestone 0 stack/moderation decisions are now captured in ADRs (`docs/adr/0001-stack.md`, `docs/adr/0002-no-auth-identity-and-moderation.md`) plus environment/secrets baseline (`docs/environments.md`).
- 2026-02-20 resolved: Milestone 1 thin slice implemented in `src/*` with API scaffolding, validation, anonymous device-token issuance/rotation, IP+token rate limiting, cooldown checks, and request-level auditing.
- 2026-02-20 resolved: Integration tests for create/read paths and vote mutation behavior now pass via `npm test` (`test/api.integration.test.js`).
- Remaining Milestone 1 gap: persistence layer is currently in-memory only (no durable DB schema/migrations yet), so production durability is not satisfied.

## Increment Notes (2026-02-20)
- Why this implementation matters:
  - It establishes a single API contract aligned to the product spec so future UI work can integrate immediately.
  - It derisks no-auth abuse controls early (token hashing, rate limits, cooldowns, audit events), which is critical for public write paths.
- Why these tests matter:
  - They verify core user-critical flows end-to-end: health availability, location contribution/read-back, and one-active-vote-per-token behavior.
  - They protect against regressions in the confidence/freshness signal inputs by validating vote update semantics.

## 1. Delivery Strategy
Ship thin vertical slices in this order:
1. Discovery first (map + nearby + search).
2. Contribution loop second (add place, add Wi-Fi, vote).
3. Risk controls third (moderation, abuse prevention, observability).

## 2. Milestones and Small Tasks

## Milestone 0: Foundations (Planning + Setup)
Goal: lock architecture and environments before code delivery.

Tasks:
- Confirm stack choices (frontend, backend, DB, hosting, analytics).
- Create architecture decision records (ADRs) for no-auth identity and moderation model.
- Set up environments: dev/stage/prod.
- Configure secrets and API key management.
- Create base repo structure and coding conventions.
- Define event tracking schema and error logging baseline.

Exit criteria:
- Approved architecture and environment checklist complete.

## Milestone 1: Data and API Base
Goal: core data structures and safe write paths.

Tasks:
- Create DB schema and migrations for locations, wifi_details, votes, reports, moderation_actions.
- Implement request validation schemas.
- Implement anonymous identity token issuance/rotation strategy.
- Implement API scaffolding and health endpoint.
- Implement rate limiting (IP + token) and request-level auditing.
- Add integration tests for create/read paths.

Exit criteria:
- Nearby and search endpoints can read seeded test data.

## Milestone 2: Nearby Map Experience
Goal: mobile-first discovery working end-to-end.

Tasks:
- Build mobile shell with map/list tabs.
- Integrate Google Maps JavaScript API.
- Implement geolocation permission and fallback entry.
- Build `GET /locations/nearby` endpoint and map pin rendering.
- Build location card with key metadata.
- Add loading, empty, and permission-denied states.

Exit criteria:
- User can open app and see nearby results on map/list.

## Milestone 3: Search and Filtering
Goal: fast search experience that feels reliable.

Tasks:
- Implement query parser and search ranking.
- Add search bar with debounce.
- Add filters (category, radius, recently verified).
- Add deep link support for search/filter state.
- Add API and UI tests for search edge cases.

Exit criteria:
- Search returns relevant results and filters persist in URL.

## Milestone 4: Add New Location
Goal: users can contribute new places with duplicate protection.

Tasks:
- Build add-location form flow.
- Integrate address autocomplete/map pin placement.
- Implement duplicate detection checks.
- Implement `POST /locations` with validation and sanitization.
- Add post-submit confirmation and immediate listing display.
- Add abuse controls (cooldown + max daily submissions/IP).

Exit criteria:
- New location appears immediately and duplicate prompts work.

## Milestone 5: Add Wi-Fi Detail
Goal: users can add public Wi-Fi details per location.

Tasks:
- Build add Wi-Fi detail form.
- Implement `POST /locations/:id/wifi-details` endpoint.
- Validate fields and sanitize output.
- Render Wi-Fi detail timeline on location page.
- Add quick report action on each Wi-Fi detail.

Exit criteria:
- New Wi-Fi details publish instantly and render correctly.

## Milestone 6: Voting and Confidence
Goal: users can validate Wi-Fi quality over time.

Tasks:
- Build `works/does_not_work` voting UI.
- Implement one-active-vote-per-token logic.
- Implement confidence score and freshness labels.
- Add stale-state transitions via scheduled job.
- Add tests for vote changes, recency weighting, and low-sample behavior.

Exit criteria:
- Vote outcomes update confidence and freshness consistently.

## Milestone 7: Moderation and Safety
Goal: keep no-auth data quality acceptable.

Tasks:
- Build report submission endpoint and UI.
- Build moderator dashboard (queue + hide/unhide + notes).
- Implement soft-delete policy and audit logs.
- Add anomaly detection signals (burst writes, repeated failures).
- Add operational runbook for incident moderation.

Exit criteria:
- Moderators can remove bad content quickly without data loss.

## Milestone 8: Launch Readiness (UK)
Goal: production launch with controlled risk.

Tasks:
- Run E2E smoke tests on mobile devices.
- Run performance tuning for map/search hot paths.
- Configure error alerts and budget alerts.
- Prepare legal pages (terms, privacy, content reporting).
- Seed initial UK city data (manual or import process).
- Execute launch checklist and rollback procedure.

Exit criteria:
- UK production launch approved.

## 3. UK Cost Implications (MVP)

## 3.1 Main Variable Cost Driver
Google Maps Platform usage is expected to be the largest usage-based cost for this product.

Published pay-as-you-go list prices (USD), after monthly free usage caps:
- Dynamic Maps: first 10,000 requests free/month, then $7 per 1,000.
- Place Details Essentials: first 10,000 requests free/month, then $5 per 1,000.
- Nearby Search Pro: first 5,000 requests free/month, then $32 per 1,000.
- Text Search Pro: first 10,000 requests free/month, then $32 per 1,000.

Notes:
- Pricing varies by SKU and monthly tier volume.
- Google also offers monthly subscription plans that change included usage and per-1,000 rates.
- UK billing may include VAT where applicable.

## 3.2 Practical Cost Scenarios (Illustrative)
Assumption per session for MVP flow:
- 1 map load
- 1 nearby search
- 2 place detail fetches

Estimated monthly Maps cost (before VAT):

| Monthly sessions | Dynamic Maps | Nearby Search Pro | Place Details Essentials | Est. total |
|---|---:|---:|---:|---:|
| 5,000 | $0 | $0 | $0 | $0 |
| 20,000 | $70 | $480 | $150 | $700 |
| 100,000 | $630 | $3,040 | $950 | $4,620 |

Interpretation:
- Costs remain low at pilot scale due to free caps.
- Costs rise quickly once nearby/text search volume scales.
- Search request volume is the strongest lever for spend.

## 3.3 Other Cost Buckets (UK MVP)
- Hosting/CDN/frontend: typically low at MVP, often free-to-low double digits monthly.
- Backend + database: often free tier initially, then low double to low triple digits as data and traffic grow.
- Monitoring/logging: low initially, increases with retention and event volume.
- Moderation operations: no-auth model increases manual moderation time/cost versus authenticated systems.

## 3.4 Cost Controls to Implement Before Launch
- Set per-day API quotas and hard budget alerts in Google Cloud.
- Cache nearby/search responses for short TTL windows where safe.
- Debounce/throttle search on client side.
- Restrict API keys by referrer/IP and rotate keys on schedule.
- Add abuse controls (rate limits + anomaly blocking) to protect quota.

## 4. Dependencies and Critical Path
Critical path:
1. Google Maps integration and quota controls.
2. DB/API foundations.
3. Nearby/search UX.
4. Contribution and voting loop.
5. Moderation tooling.

Any delay in moderation tooling is high risk because this MVP is no-auth and immediately publishes user content.

## 5. Open Decisions Remaining
- Stack selection (frontend/backend/DB/hosting).
- Exact confidence score formula and thresholds.
- Moderator staffing model and response SLA targets.
- Initial UK city rollout sequence.

## 6. Source Links for Pricing
- Google Maps Platform pricing overview: https://mapsplatform.google.com/pricing/
- Google Maps Platform pricing list (SKU table): https://developers.google.com/maps/billing-and-pricing/pricing
- Google Maps Platform subscription plans: https://developers.google.com/maps/billing-and-pricing/subscription-plans
- Google Cloud taxes (VAT applicability context): https://cloud.google.com/tax-help
