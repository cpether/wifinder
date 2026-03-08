# WiFinder Implementation Plan (Milestones + Cost)

## Document Status
- Version: v2
- Date: 2026-03-08
- Linked spec: `specs/wifinder-product-spec.md`

## Status Legend
- Milestone status: `Complete`, `In Progress`, `Not Started`
- Task status: `- [x]` complete, `- [ ]` not complete

## Current Execution Tracker
- 2026-02-20: Milestone 0 moved to `Complete`.
- 2026-02-20: Milestones 2-7 have backend/API work in place and are `In Progress`, but their frontend and operational work is still outstanding.
- 2026-02-20: Milestone 8 remains `Not Started`.
- 2026-03-08: Milestone 1 moved to `Complete` after replacing the in-memory store with SQLite-backed persistence, schema migrations, and restart coverage.
- 2026-03-08: The next unblocked item in delivery order is Milestone 2 user-facing work, starting with the mobile shell for map/list tabs.
- 2026-03-08: Confirmed the repository still has no frontend entrypoint or static assets; Milestone 2 work must start by adding a browser shell on top of the existing nearby/search APIs.
- 2026-03-08: Milestone 2 moved to `Complete` after shipping a mobile-first web shell, nearby list cards, geolocation and fallback entry, conditional Google Maps rendering, and focused integration coverage for the browser entrypoint.
- 2026-03-08: The next unblocked item in delivery order is Milestone 3 user-facing work, starting with the search bar and debounce behavior on top of the existing search API.
- 2026-03-09: Confirmed `GET /api/locations/search` and ranking/filter backend support already exist; the remaining gap for the earliest Milestone 3 task is the browser search UI and debounced client fetch flow.
- 2026-03-09: `npm test` in this checkout initially failed before product assertions because the declared `better-sqlite3` dependency had not been installed locally; `AGENTS.md` now calls out `npm install` as a fresh-checkout prerequisite.
- 2026-03-09: Milestone 3 search-bar work moved forward after wiring the browser shell to the existing search API with debounced requests and focused client/server coverage.
- 2026-03-09: The next unblocked item in delivery order is Milestone 3 UI filters for category, radius, and recently verified state, which can now build on the shared search shell.
- 2026-03-08: Tooling migration note: the repository now standardizes on `pnpm` with a committed `pnpm-lock.yaml` and `packageManager` field so future install/test loops use one package manager consistently.
- 2026-03-08: The pnpm migration also whitelists `better-sqlite3` as an allowed native build so installs remain non-interactive and the SQLite-backed test suite still runs.
- 2026-03-08: Milestone 3 search bar work is now in place; the browser shell can issue debounced `/api/locations/search` requests, keep nearby mode when the query is empty, and support query-only search before a center is chosen.
- 2026-03-08: The next unblocked Milestone 3 item is UI filter controls for category, radius, and recently verified state, followed by URL persistence for search/filter state.

## Increment Notes (2026-02-20)
- Why this implementation matters:
  - It establishes a single API contract aligned to the product spec so future UI work can integrate immediately.
  - It derisks no-auth abuse controls early (token hashing, rate limits, cooldowns, audit events), which is critical for public write paths.
- Why these tests matter:
  - They verify core user-critical flows end-to-end: health availability, location contribution/read-back, and one-active-vote-per-token behavior.
  - They protect against regressions in the confidence/freshness signal inputs by validating vote update semantics.

## Increment Notes (2026-03-08)
- Why this implementation matters:
  - Durable SQLite storage closes the main Milestone 1 production gap so contributed locations, Wi-Fi details, votes, and reports survive process restarts.
  - File-based migrations create a single source of truth for the MVP data model and make future moderator/admin work build on stable tables instead of ephemeral state.
- Why these tests matter:
  - Restart coverage proves the persistence layer is real rather than incidental, which is the core risk this increment was meant to remove.
  - Existing API integration tests still passing confirms the storage swap did not break the established public contract.

## Increment Notes (2026-03-08, Milestone 2)
- Why this implementation matters:
  - The app now has a real browser entrypoint instead of API-only infrastructure, which unlocks user testing of nearby discovery on mobile without waiting for later contribution flows.
  - Nearby discovery now uses the existing API contract end-to-end in both list and map contexts, so future search/filter work can extend one surface instead of starting from scratch.
- Why these tests matter:
  - Shell-route coverage protects the new HTML/CSS/JS entrypoint from accidental regressions in server routing or asset serving.
  - Nearby summary assertions lock in the `last_verified_at` metadata that the location cards need, preventing future API changes from silently breaking the client.

## Increment Notes (2026-03-08, Milestone 3 Search)
- Why this implementation matters:
  - Debounced search turns the existing API-only search capability into an actual user-facing discovery path, which is the first missing slice in Milestone 3.
  - Query-only search keeps the landing experience useful before geolocation succeeds, while preserving distance-biased results whenever a nearby center is available.
- Why these tests matter:
  - Web-shell assertions protect the new search bootstrap wiring and input markup so future routing changes do not silently drop the feature.
  - Query-only search coverage locks in the API behavior the search bar depends on when users type before selecting a location.

## 1. Delivery Strategy
Ship thin vertical slices in this order:
1. Discovery first (map + nearby + search).
2. Contribution loop second (add place, add Wi-Fi, vote).
3. Risk controls third (moderation, abuse prevention, observability).

Implementation rule for the next increment:
1. Keep the current HTTP API contract, validation behavior, and confidence semantics.
2. Prefer the earliest unblocked user-facing milestone item.
3. Keep documentation focused on remaining work, not completed migrations/refactors.

## 1.1 Target Architecture
Preferred structure for this repository:
- Modular monolith for MVP.
- One relational source of truth.
- Clear layering:
  - HTTP/routes
  - validation
  - domain/services
  - repositories
  - database client + migrations
- Explicit seed/dev scripts instead of automatic boot seeding.
- Tests split by concern:
  - domain/unit tests
  - repository/database tests
  - API integration tests

Current baseline:
- API contract is in place for nearby, search, location detail, location creation, Wi-Fi detail creation, voting, summary, and reporting.
- Persistence is SQLite-backed with migrations, explicit seeding, repository tests, and API integration tests.
- Remaining work is primarily user-facing product delivery plus moderation and launch readiness.

## 2. Milestones and Small Tasks

## Milestone 0: Foundations (Planning + Setup) - Status: Complete
Goal: lock architecture and environments before code delivery.

Tasks:
- [x] Confirm stack choices (frontend, backend, DB, hosting, analytics).
- [x] Create architecture decision records (ADRs) for no-auth identity and moderation model.
- [x] Set up environments: dev/stage/prod.
- [x] Configure secrets and API key management.
- [x] Create base repo structure and coding conventions.
- [x] Define event tracking schema and error logging baseline.

Exit criteria:
- [x] Approved architecture and environment checklist complete.

## Milestone 1: Data and API Base - Status: Complete
Goal: core data structures and safe write paths.

Tasks:
- [x] Create DB schema and migrations for locations, wifi_details, votes, reports, moderation_actions.
- [x] Implement request validation schemas.
- [x] Implement anonymous identity token issuance/rotation strategy.
- [x] Implement API scaffolding and health endpoint.
- [x] Implement rate limiting (IP + token) and request-level auditing.
- [x] Add integration tests for create/read paths.

Exit criteria:
- [x] Nearby and search endpoints can read seeded test data.
- [x] Durable persistence survives application restart for implemented write paths.

## Milestone 2: Nearby Map Experience - Status: Complete
Goal: mobile-first discovery working end-to-end.

Tasks:
- [x] Build mobile shell with map/list tabs.
- [x] Integrate Google Maps JavaScript API.
- [x] Implement geolocation permission and fallback entry.
- [x] Build `GET /locations/nearby` endpoint.
- [x] Add map pin rendering.
- [x] Build location card with key metadata.
- [x] Add loading, empty, and permission-denied states.

Exit criteria:
- [x] User can open app and see nearby results on map/list.

## Milestone 3: Search and Filtering - Status: In Progress
Goal: fast search experience that feels reliable.

Tasks:
- [x] Implement query parser and search ranking.
- [x] Add search bar with debounce.
- [x] Add API support for filters (category, radius, recently verified).
- [ ] Add UI filters (category, radius, recently verified).
- [ ] Add deep link support for search/filter state.
- [ ] Add API and UI tests for search edge cases.

Exit criteria:
- [ ] Search returns relevant results and filters persist in URL.

## Milestone 4: Add New Location - Status: In Progress
Goal: users can contribute new places with duplicate protection.

Tasks:
- [ ] Build add-location form flow.
- [ ] Integrate address autocomplete/map pin placement.
- [ ] Implement duplicate detection checks.
- [x] Implement `POST /locations` with validation and sanitization.
- [ ] Add post-submit confirmation and immediate listing display.
- [x] Add abuse controls (cooldown + max daily submissions/IP).

Exit criteria:
- [ ] New location appears immediately and duplicate prompts work.

## Milestone 5: Add Wi-Fi Detail - Status: In Progress
Goal: users can add public Wi-Fi details per location.

Tasks:
- [ ] Build add Wi-Fi detail form.
- [x] Implement `POST /locations/:id/wifi-details` endpoint.
- [x] Validate fields and sanitize output.
- [ ] Render Wi-Fi detail timeline on location page.
- [ ] Add quick report action on each Wi-Fi detail.

Exit criteria:
- [ ] New Wi-Fi details publish instantly and render correctly.

## Milestone 6: Voting and Confidence - Status: In Progress
Goal: users can validate Wi-Fi quality over time.

Tasks:
- [ ] Build `works/does_not_work` voting UI.
- [x] Implement one-active-vote-per-token logic.
- [x] Implement confidence score and freshness labels.
- [ ] Add stale-state transitions via scheduled job.
- [ ] Add tests for vote changes, recency weighting, and low-sample behavior.

Exit criteria:
- [ ] Vote outcomes update confidence and freshness consistently.

## Milestone 7: Moderation and Safety - Status: In Progress
Goal: keep no-auth data quality acceptable.

Tasks:
- [x] Build report submission endpoint.
- [ ] Build report submission UI.
- [ ] Build moderator dashboard (queue + hide/unhide + notes).
- [ ] Implement soft-delete policy and audit logs.
- [ ] Add anomaly detection signals (burst writes, repeated failures).
- [ ] Add operational runbook for incident moderation.

Exit criteria:
- [ ] Moderators can remove bad content quickly without data loss.

## Milestone 8: Launch Readiness (UK) - Status: Not Started
Goal: production launch with controlled risk.

Tasks:
- [ ] Run E2E smoke tests on mobile devices.
- [ ] Run performance tuning for map/search hot paths.
- [ ] Configure error alerts and budget alerts.
- [ ] Prepare legal pages (terms, privacy, content reporting).
- [ ] Seed initial UK city data (manual or import process).
- [ ] Execute launch checklist and rollback procedure.

Exit criteria:
- [ ] UK production launch approved.

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
- Exact confidence score formula and thresholds.
- Moderator staffing model and response SLA targets.
- Initial UK city rollout sequence.

## 6. Source Links for Pricing
- Google Maps Platform pricing overview: https://mapsplatform.google.com/pricing/
- Google Maps Platform pricing list (SKU table): https://developers.google.com/maps/billing-and-pricing/pricing
- Google Maps Platform subscription plans: https://developers.google.com/maps/billing-and-pricing/subscription-plans
- Google Cloud taxes (VAT applicability context): https://cloud.google.com/tax-help
