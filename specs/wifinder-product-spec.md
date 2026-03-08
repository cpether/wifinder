# WiFinder Product Spec (Web MVP)

## Document Status
- Version: v2
- Date: 2026-03-08
- Scope: Mobile-first web app only (no native app)

## Locked Product Decisions
- Publish model: New locations and Wi-Fi details publish immediately.
- Wi-Fi detail visibility: Public (including passwords when submitted).
- Authentication: No user auth for MVP.
- Launch geography: United Kingdom first.

## Implementation Architecture (MVP)
- Application shape: modular monolith. Keep one codebase and one deployable app for MVP rather than splitting services.
- API boundary: preserve the documented HTTP contract as the stable integration boundary while internal modules evolve.
- Backend layering:
  - route/http layer for request parsing and response shaping
  - validation layer for input contracts
  - domain/service layer for business logic such as confidence, duplicate detection, and moderation rules
  - repository layer for persistence operations
  - database client + migrations layer as the single source of truth for storage
- Persistence direction:
  - durable relational storage is required for MVP
  - migrations are the authoritative schema definition
  - seed data must be explicit dev/test setup, not automatic production boot behavior
- Transition note:
  - the current repository contains a working but transitional SQLite-backed implementation
  - the next backend refactor should keep the API contract, validation rules, and tests, while replacing the single-file persistence implementation with a cleaner layered structure
- Scaling direction:
  - current MVP can continue on SQLite while traffic and moderation volume are low
  - if nearby/search scale or richer geo queries are needed, the preferred upgrade path is PostgreSQL, with PostGIS if geo complexity justifies it

## 1. Product Goal
Help people quickly find nearby venues with free Wi-Fi and verify whether current Wi-Fi details still work.

## 2. Success Criteria (MVP)
- A user can open the app on mobile and discover nearby Wi-Fi-enabled venues within 10 seconds on a typical 4G connection.
- A user can search and filter venues by area, category, and distance.
- A user can add a new venue and Wi-Fi detail in under 60 seconds.
- A user can vote on whether existing Wi-Fi details still work.
- Users can see a confidence signal that reflects recency and vote outcomes.

## 3. Users and Roles
- Public user (anonymous): browse map/list, search, add locations, add Wi-Fi details, vote, report content.
- Moderator/admin: review reports, hide/remove abusive or incorrect entries, restore entries if needed.

## 4. Core User Stories
1. As a user, I can find nearby places with free Wi-Fi on a map.
2. As a user, I can search for places by name, area, or category.
3. As a user, I can add a new place with free Wi-Fi.
4. As a user, I can add Wi-Fi details to a place.
5. As a user, I can vote "works" or "doesn't work" on a Wi-Fi detail.
6. As a user, I can report inaccurate or abusive content.

## 5. Functional Requirements

### 5.1 Nearby Map Discovery (Google Maps)
- Request browser geolocation permission.
- Display current location and nearby venues on Google Map.
- Support map/list toggle optimized for one-hand mobile use.
- Venue cards show: name, category, distance, Wi-Fi confidence, last verified date.

### 5.2 Search and Filters
- Search input supports place name, street, postcode, area.
- Filters: category, distance radius, and "recently verified".
- Results ranked by distance + confidence + text relevance.

### 5.3 Add New Location
- Required fields: name, category, location (map pin or address).
- Optional fields: address text, notes.
- Duplicate check before submit (name similarity + proximity threshold).
- Submit is immediately visible.

### 5.4 Add Wi-Fi Details
- Required fields: SSID.
- Optional fields: password, access notes, time limits, purchase required toggle.
- Automatically store submitted timestamp.
- Submit is immediately visible.

### 5.5 Vote on Wi-Fi Details
- Vote types: `works` or `does_not_work`.
- Anonymous identity model: one active vote per browser session/device token per Wi-Fi detail.
- Users can change their vote; most recent vote is active.

### 5.6 Confidence and Freshness
- Confidence score components:
  - vote ratio (works vs does_not_work)
  - recency decay (recent reports weighted higher)
  - minimum signal threshold (avoid over-trusting low sample counts)
- Freshness badges:
  - `Verified recently` (e.g., success vote in last 30 days)
  - `Stale` (no success signal in last 90 days)

### 5.7 Abuse and Quality Controls (No-Auth Model)
- Rate limit submissions and votes by IP + anonymous device token.
- Add cooldown between repeated actions on same entity.
- Provide report action on locations and Wi-Fi details.
- Enable moderator hide/unhide and soft-delete tools.
- Log moderation actions for auditability.

## 6. Non-Functional Requirements
- Mobile-first responsive UI (320px+ widths).
- p95 API response target: < 600ms for nearby/search under normal load.
- Accessibility baseline: WCAG AA contrast, semantic labels, keyboard focus states.
- Privacy baseline: clear notice for geolocation and user-submitted public data.
- Security baseline: input validation, output escaping, CSRF protections, API key restrictions.
- Maintainability baseline:
  - avoid single-file implementations that mix HTTP, persistence, migrations, seeding, and business logic
  - use parameterized database access and explicit schema constraints
  - preserve one relational source of truth for application data

## 7. Data Model (MVP)
- `locations`
  - id, name, category, lat, lng, address, place_source, created_at, status
- `wifi_details`
  - id, location_id, ssid, password, access_notes, created_at, status
- `wifi_votes`
  - id, wifi_detail_id, voter_token_hash, vote_type, created_at, updated_at
- `reports`
  - id, target_type, target_id, reason, reporter_token_hash, created_at, status
- `moderation_actions`
  - id, target_type, target_id, action, moderator_id, note, created_at

## 8. API Contract (MVP)
- `GET /api/locations/nearby?lat&lng&radius&category`
- `GET /api/locations/search?q&lat&lng&radius&category&verified`
- `GET /api/locations/:id`
- `POST /api/locations`
- `POST /api/locations/:id/wifi-details`
- `POST /api/wifi-details/:id/votes`
- `GET /api/wifi-details/:id/summary`
- `POST /api/reports`
- `POST /api/moderation/actions` (admin only)

## 9. UX Flows (Mobile)
1. Landing -> location permission -> nearby map/list.
2. Search/filter -> view location detail -> inspect Wi-Fi options.
3. Add location -> duplicate warning -> submit -> visible immediately.
4. Add Wi-Fi detail -> submit -> vote prompt shown.
5. Vote works/fails -> confidence/freshness recalculates.
6. Report bad data -> user confirmation.

## 10. Moderation and Legal Notes (UK Launch)
- Because content is public and unauthenticated, moderation queue and response SLAs are critical.
- Publish clear terms stating submitted Wi-Fi details are user-generated and may change.
- Provide removal/report mechanisms for incorrect, unsafe, or sensitive information.
- Provide privacy notice covering geolocation handling and abuse-prevention identifiers (hashed token/IP handling policy).

## 11. Risks and Mitigations
- Risk: Spam/fake Wi-Fi details due to no auth.
  - Mitigation: rate limits, anomaly detection, report flow, moderator tooling.
- Risk: Outdated passwords.
  - Mitigation: recency weighting, stale badges, explicit vote prompts after view.
- Risk: API cost spikes from map/search traffic.
  - Mitigation: strict quotas, caching, and budget alerts.
- Risk: backend complexity grows faster than the current single-file persistence design can safely support.
  - Mitigation: refactor to a modular monolith structure before expanding feature surface area further.

## 12. Out of Scope (MVP)
- Native iOS/Android apps.
- Gamification and reputation systems.
- Complex social features.
- Offline mode.
