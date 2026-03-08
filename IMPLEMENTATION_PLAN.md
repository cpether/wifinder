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
- 2026-02-20: Milestone 1 moved to `In Progress`.
- 2026-02-20: Milestones 2-7 have backend/API work in place and are `In Progress`, but their frontend and operational work is still outstanding.
- 2026-02-20: Milestone 8 remains `Not Started`.
- 2026-03-08: Milestone 1 moved to `Complete` after replacing the in-memory store with SQLite-backed persistence, schema migrations, and restart coverage.
- 2026-03-08: Current persistence is good enough to continue development, but the shell-backed single-file store is now the main structural risk. Next backend work should keep the API contract and tests while refactoring internals to a modular monolith shape.
- 2026-03-08: Milestone 2A moved to `In Progress`. The first contract-freeze increment added integration coverage for response-shape expectations, report creation, and current error envelope behavior.
- 2026-03-08: Milestone 2A step 2 completed. `src/db.js` is now a composition layer over a database client, migration runner, repositories, and service modules. Shell-based SQLite execution and automatic boot seeding remain as explicit follow-up tasks.
- 2026-03-08: Milestone 2A step 3 requires both a new database client and repository call-site changes, because the current repository layer still interpolates SQL through `sqlValue/sqlValues` on top of `/usr/bin/sqlite3`.
- 2026-03-08: Milestone 2A step 3 completed. The backend now uses direct `better-sqlite3` access with parameterized repository queries and transaction-based migrations/seeding instead of spawning the SQLite CLI.
- 2026-03-08: API integration tests pass unchanged after the client swap, so the current HTTP contract and restart-persistence behavior remain intact. The next unblocked backend task is removing automatic seed-on-boot behavior.

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

## Increment Notes (2026-03-08, Architecture Direction)
- Why this change in approach matters:
  - The current code now has a stable API surface, validation rules, and core business logic worth keeping.
  - The main weakness is internal structure, not product direction. Rebuilding from scratch would waste working behavior; continuing to pile features into the current persistence file would increase risk.
  - The preferred path is to keep the good edges and replace the weak core: modular monolith, stable API contract, explicit repository boundaries, and direct database access.
- Why this sequencing matters:
  - It reduces rework by fixing the backend foundation before more UI and moderation features depend on it.
  - It keeps delivery moving because feature work can resume immediately after the internal refactor, without changing external behavior.

## Increment Notes (2026-03-08, Milestone 2A Step 1)
- Why this implementation matters:
  - Broader integration coverage freezes the current API contract before the persistence internals are restructured, which reduces the risk of accidental endpoint drift during refactoring.
  - Report submission is now covered alongside existing location, Wi-Fi detail, vote, and restart-persistence flows, giving the refactor a better regression net across the full MVP write surface.
- Why these tests matter:
  - They lock down summary/list/detail response shape expectations that clients already depend on, including the absence of nested `wifi_details` in list/search responses.
  - They capture a current contract detail that would be easy to change by accident: the error envelope omits `details` when no detail payload exists.

## Increment Notes (2026-03-08, Milestone 2A Step 2)
- Why this implementation matters:
  - The backend no longer depends on one persistence file that mixes SQL execution, migrations, seeding, repositories, and business logic. That lowers the risk of further refactors and makes the next database-access change isolated to the client layer.
  - `createStore()` remains the same server-facing boundary, so the rest of the application can continue moving while the backend internals are cleaned up incrementally.
- Why these tests matter:
  - The unchanged integration suite proves the module split preserved existing behavior across health, location reads/writes, Wi-Fi detail writes, votes, reports, and restart persistence.
  - Keeping behavior fixed while restructuring internals reduces the chance that later 2A steps accidentally bundle architecture changes with contract changes.

## Increment Notes (2026-03-08, Milestone 2A Step 3)
- Why this implementation matters:
  - Direct database access removes the `/usr/bin/sqlite3` process dependency from the application path and makes persistence behavior part of the app itself instead of shell execution.
  - Parameterized repository queries replace string-built SQL at the storage boundary, which is the maintainable and spec-aligned foundation needed before more backend work lands.
- Why these tests matter:
  - Re-running the existing API integration suite verifies the storage implementation changed without changing the public API contract.
  - Restart-persistence coverage still passing confirms the new client is truly writing durable state, not just matching happy-path responses.

## 1. Delivery Strategy
Ship thin vertical slices in this order:
1. Discovery first (map + nearby + search).
2. Contribution loop second (add place, add Wi-Fi, vote).
3. Risk controls third (moderation, abuse prevention, observability).

Implementation rule for the next increment:
1. Keep the current HTTP API contract, validation behavior, and confidence semantics.
2. Replace the persistence internals before adding more major feature surface area.
3. Resume milestone delivery on top of the refactored backend structure.

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

Keep from the current implementation:
- API contract
- validation logic
- confidence/freshness logic
- token/rate-limit concepts
- integration test coverage

Replace from the current implementation:
- single-file persistence layer
- shell-based query execution
- automatic boot seeding in the main application path
- mixed concerns inside one module

## 1.2 Transition Plan From Current State
Best path: delete weak internals, keep stable behavior.

Step 1. Freeze the contract
- Expand API integration coverage around current endpoints before structural refactors.
- Verify location creation, Wi-Fi detail creation, votes, reports, and restart persistence remain stable.

Step 2. Introduce the database boundary
- Split the current persistence implementation into:
  - database client
  - migration runner
  - repositories for locations, Wi-Fi details, votes, reports, and moderation actions
- Keep route handlers unchanged other than wiring to the new modules.

Step 3. Replace shell-backed persistence
- Remove process-spawned SQLite calls and move to direct database access with parameterized queries.
- Preserve the existing SQLite schema and migration history where possible to avoid churn.

Step 4. Make seeding explicit
- Move seeded demo data out of normal app boot.
- Add explicit dev/test seed setup so production startup never mutates state implicitly.

Step 5. Strengthen the schema
- Add missing `CHECK` constraints and indexes for enum-like fields and hot read paths.
- Add duplicate-detection support fields/indexes needed for location submission work.

Step 6. Add structure-specific tests
- Add repository tests against a real test database.
- Add migration bootstrap tests for empty database startup.
- Keep the API integration suite as the regression net.

Step 7. Resume feature work
- Continue milestone delivery starting with the earliest unblocked user-facing item after the backend refactor is complete.

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

## Milestone 2: Nearby Map Experience - Status: In Progress
Goal: mobile-first discovery working end-to-end.

Tasks:
- [ ] Build mobile shell with map/list tabs.
- [ ] Integrate Google Maps JavaScript API.
- [ ] Implement geolocation permission and fallback entry.
- [x] Build `GET /locations/nearby` endpoint.
- [ ] Add map pin rendering.
- [ ] Build location card with key metadata.
- [ ] Add loading, empty, and permission-denied states.

Exit criteria:
- [ ] User can open app and see nearby results on map/list.

## Milestone 2A: Backend Structure Refactor - Status: In Progress
Goal: preserve current behavior while replacing the fragile backend core.

Tasks:
- [x] Freeze the current API contract with broader integration coverage for locations, Wi-Fi details, votes, and reports.
- [x] Split persistence responsibilities into database client, migration runner, repositories, and service modules.
- [x] Replace shell-based SQLite execution with direct parameterized database access.
- [ ] Remove automatic seed-on-boot behavior and replace it with explicit dev/test seeding.
- [ ] Add repository tests and migration bootstrap tests.
- [x] Confirm all existing API tests still pass without endpoint contract changes.

Exit criteria:
- [ ] The backend uses a layered modular structure without a single-file persistence bottleneck.
- [ ] API behavior remains compatible with existing clients and tests.
- [ ] Feature work can continue without building new behavior on the old persistence shape.

## Milestone 3: Search and Filtering - Status: In Progress
Goal: fast search experience that feels reliable.

Tasks:
- [x] Implement query parser and search ranking.
- [ ] Add search bar with debounce.
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
