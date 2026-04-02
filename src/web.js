import fs from "node:fs";
import { send } from "./http.js";

const APP_JS = fs.readFileSync(new URL("./web/app.js", import.meta.url), "utf8");
const APP_CSS = fs.readFileSync(new URL("./web/app.css", import.meta.url), "utf8");
const DEFAULT_RADIUS = 2000;
const RADIUS_OPTIONS = [500, 1000, 2000, 5000, 10000];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function serializeBootstrap(payload) {
  return JSON.stringify(payload).replaceAll("<", "\\u003c");
}

function renderBootstrap(config) {
  return serializeBootstrap({
    googleMapsApiKey: config.googleMapsApiKey,
    nearbyEndpoint: "/api/locations/nearby",
    searchEndpoint: "/api/locations/search",
    createLocationEndpoint: "/api/locations",
    searchDebounceMs: 300,
    defaultRadius: DEFAULT_RADIUS,
    radiusOptions: RADIUS_OPTIONS,
    fallbackCenter: {
      lat: 51.5072,
      lng: -0.1276,
      label: "Central London"
    }
  });
}

function renderClassicAppHtml(config) {
  const bootstrap = renderBootstrap(config);

  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml("WiFinder")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/app.css">
  </head>
  <body>
    <div class="bg-sky" aria-hidden="true"></div>

    <main class="app-shell">

      <!-- ══════ HEADER ══════ -->
      <header class="app-header">
        <div class="logo">
          <div class="logo-circle"><div class="logo-dot"></div></div>
          <span class="logo-text">Wi<span class="logo-accent">Finder</span></span>
        </div>
        <div class="header-actions">
          <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Toggle dark mode">
            <svg id="theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <svg id="theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
        </div>
      </header>

      <!-- ══════ HERO ══════ -->
      <section class="hero-section">
        <h1>Connect anywhere. <span class="accent-text">Share everywhere.</span></h1>
        <p class="hero-sub">Find free WiFi spots nearby and share passwords with a growing community of explorers.</p>
      </section>

      <!-- ══════ LOCATION BUTTONS ══════ -->
      <section class="location-buttons">
        <button class="btn btn-primary" id="use-location" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
          Use my location
        </button>
        <button class="btn btn-ghost" id="use-fallback" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Central London
        </button>
      </section>

      <!-- ══════ FLOATING MAP CARD ══════ -->
      <section class="map-card" id="panel-map" aria-label="Map of nearby Wi-Fi venues">
        <div class="map-frame">
          <div class="map-canvas" id="map-canvas"></div>
          <div class="map-overlay" id="map-overlay">Use my location or Central London to load the map.</div>
        </div>
      </section>

      <!-- ══════ SEARCH BAR (standalone pill) ══════ -->
      <section class="search-bar-section">
        <div class="search-bar">
          <svg class="search-bar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            class="search-bar-input"
            id="search-input"
            type="search"
            inputmode="search"
            autocomplete="off"
            placeholder="Search by place, street, postcode, or area"
          >
          <button class="btn btn-primary btn-search" type="button">Search</button>
        </div>
      </section>

      <!-- ══════ FILTER ROW ══════ -->
      <section class="filter-section">
        <div class="filter-grid">
          <label class="filter-label" for="category-input">
            <input
              class="filter-input"
              id="category-input"
              type="search"
              inputmode="search"
              autocomplete="off"
              placeholder="Category (cafe, library…)"
            >
          </label>
          <label class="filter-label" for="radius-select">
            <select class="filter-select" id="radius-select">
              ${RADIUS_OPTIONS.map(
                (radius) =>
                  `<option value="${radius}">${radius < 1000 ? `${radius} m` : `${radius / 1000} km`}</option>`
              ).join("")}
            </select>
          </label>
          <label class="filter-toggle" for="verified-only">
            <input id="verified-only" type="checkbox">
            <span>Verified only</span>
          </label>
        </div>
      </section>

      <!-- ══════ STATUS BANNER ══════ -->
      <div class="status-banner" id="status-banner" aria-live="polite">Choose a location to load nearby venues, or start typing to search the full dataset.</div>

      <!-- ══════ NEARBY SPOTS ══════ -->
      <section class="spots-section" aria-labelledby="spots-heading">
        <div class="spots-header">
          <div>
            <h2 id="spots-heading" class="spots-title">Nearby Spots</h2>
            <p class="spots-sub">WiFi details verified by the community</p>
          </div>
          <div class="live-badge">
            <div class="live-dot"></div>
            <span>Live</span>
          </div>
        </div>

        <!-- hidden tab buttons preserved for JS/test compat -->
        <div class="tab-list" role="tablist" aria-label="Browse by map or list" hidden>
          <button class="tab-button is-active" id="tab-list" type="button" role="tab" aria-selected="true" aria-controls="panel-list" data-tab="list">List</button>
          <button class="tab-button" id="tab-map" type="button" role="tab" aria-selected="false" aria-controls="panel-map" data-tab="map">Map</button>
        </div>

        <section id="panel-list">
          <div class="results-summary" id="results-summary">No search run yet.</div>
          <div class="card-list" id="location-list"></div>
        </section>
      </section>

      <section class="contribute-card" aria-labelledby="add-location-heading">
        <div class="contribute-header">
          <div>
            <p class="eyebrow">Contribute</p>
            <h2 id="add-location-heading" class="contribute-title">Add a new Wi-Fi venue</h2>
          </div>
        </div>
        <p class="contribute-copy">Add a venue in under a minute. New locations publish immediately after duplicate review.</p>
        <form class="add-location-form" id="add-location-form">
          <label class="add-location-field" for="add-location-name">
            <span class="manual-label-text">Venue name</span>
            <input class="input-field" id="add-location-name" name="name" autocomplete="off" maxlength="120" placeholder="Shoreditch Study Hall" required>
          </label>
          <label class="add-location-field" for="add-location-category">
            <span class="manual-label-text">Category</span>
            <input class="input-field" id="add-location-category" name="category" autocomplete="off" maxlength="60" placeholder="cafe, library, coworking" required>
          </label>
          <div class="form-feedback" id="add-location-location-summary" aria-live="polite"></div>
          <label class="add-location-field" for="add-location-address">
            <span class="manual-label-text">Address or postcode</span>
            <input class="input-field" id="add-location-address" name="address" autocomplete="street-address" maxlength="220" placeholder="Search or type an address">
          </label>
          <div class="add-location-actions">
            <button class="btn btn-ghost btn-sm" id="add-location-use-current" type="button">Use current area</button>
            <button class="btn btn-ghost btn-sm" id="add-location-place-pin" type="button">Place pin on map</button>
          </div>
          <label class="add-location-field" for="add-location-notes">
            <span class="manual-label-text">Notes (optional)</span>
            <textarea class="input-field input-field-textarea" id="add-location-notes" name="notes" maxlength="500" placeholder="Quiet upstairs tables near plugs."></textarea>
          </label>
          <div class="form-feedback" id="add-location-feedback" aria-live="polite"></div>
          <section class="duplicate-warning" id="add-location-duplicate-warning" hidden aria-live="polite">
            <p class="duplicate-warning-title" id="add-location-duplicate-summary"></p>
            <div class="duplicate-warning-list" id="add-location-duplicate-list"></div>
            <div class="duplicate-warning-actions">
              <button class="btn btn-primary btn-sm" id="add-location-submit-anyway" type="button">Submit anyway</button>
              <button class="btn btn-ghost btn-sm" id="add-location-cancel-warning" type="button">Edit details</button>
            </div>
          </section>
          <button class="btn btn-primary" id="add-location-submit" type="submit">Add venue</button>
        </form>
      </section>

      <!-- ══════ CTA ══════ -->
      <section class="cta-card">
        <div class="cta-blur cta-blur-tr"></div>
        <div class="cta-blur cta-blur-bl"></div>
        <h2 class="cta-title">Know a WiFi password?</h2>
        <p class="cta-sub">Share passwords from your favourite spots and help others stay connected wherever they go.</p>
        <p class="cta-note">Submitted Wi-Fi details are public user-generated content.</p>
      </section>

      <!-- ══════ FOOTER ══════ -->
      <footer class="app-footer">
        <div class="footer-logo">
          <div class="footer-logo-circle"><div class="footer-logo-dot"></div></div>
          <span class="footer-logo-text">Wi<span class="logo-accent">Finder</span></span>
        </div>
        <div class="live-badge">
          <div class="live-dot"></div>
          Live
        </div>
        <p class="footer-copy">&copy; 2026 WiFinder. All rights reserved.</p>
      </footer>

    </main>

    <script id="app-bootstrap" type="application/json">${bootstrap}</script>
    <script src="/assets/app.js" defer></script>
  </body>
</html>`;
}

function renderMapLayoutAppHtml(config) {
  const bootstrap = renderBootstrap(config);

  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml("WiFinder")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/app.css">
  </head>
  <body class="layout-map-overlay">
    <div class="bg-sky" aria-hidden="true"></div>

    <main class="app-shell app-shell--map-overlay">
      <section class="map-layout-hero">
        <header class="app-header app-header--overlay">
          <div class="logo">
            <div class="logo-circle"><div class="logo-dot"></div></div>
            <span class="logo-text">Wi<span class="logo-accent">Finder</span></span>
          </div>
          <div class="header-actions">
            <a class="layout-switch" href="/" aria-label="Open classic home layout">Classic view</a>
            <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Toggle dark mode">
              <svg id="theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              <svg id="theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            </button>
          </div>
        </header>

        <section class="map-card map-card--immersive is-active" id="panel-map" aria-label="Map of nearby Wi-Fi venues">
          <div class="map-frame map-frame--immersive">
            <div class="map-canvas" id="map-canvas"></div>
            <div class="map-layout-backdrop" aria-hidden="true"></div>
            <div class="map-layout-copy">
              <p class="map-layout-kicker">Home/Map Search</p>
              <h1>Browse by map or list.</h1>
              <p class="map-layout-sub">A map-first home screen inspired by your Stitch concept, rebuilt with the current WiFinder blue palette and the existing light/dark theme switcher.</p>
            </div>
            <div class="map-layout-controls">
              <div class="location-buttons location-buttons--overlay">
                <button class="btn btn-primary" id="use-location" type="button">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
                  Use my location
                </button>
                <button class="btn btn-ghost" id="use-fallback" type="button">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Central London
                </button>
              </div>
              <section class="search-bar-section search-bar-section--overlay">
                <div class="search-bar">
                  <svg class="search-bar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    class="search-bar-input"
                    id="search-input"
                    type="search"
                    inputmode="search"
                    autocomplete="off"
                    placeholder="Search by place, street, postcode, or area"
                  >
                  <button class="btn btn-primary btn-search" type="button">Search</button>
                </div>
              </section>
              <section class="filter-section filter-section--overlay">
                <div class="filter-grid">
                  <label class="filter-label" for="category-input">
                    <input
                      class="filter-input"
                      id="category-input"
                      type="search"
                      inputmode="search"
                      autocomplete="off"
                      placeholder="Category (cafe, library…)"
                    >
                  </label>
                  <label class="filter-label" for="radius-select">
                    <select class="filter-select" id="radius-select">
                      ${RADIUS_OPTIONS.map(
                        (radius) =>
                          `<option value="${radius}">${radius < 1000 ? `${radius} m` : `${radius / 1000} km`}</option>`
                      ).join("")}
                    </select>
                  </label>
                  <label class="filter-toggle" for="verified-only">
                    <input id="verified-only" type="checkbox">
                    <span>Verified only</span>
                  </label>
                </div>
              </section>
              <div class="status-banner status-banner--overlay" id="status-banner" aria-live="polite">Choose a location to load nearby venues, or start typing to search the full dataset.</div>
            </div>
            <div class="map-overlay" id="map-overlay">Use my location or Central London to load the map.</div>
          </div>
        </section>

        <div class="tab-list" role="tablist" aria-label="Browse by map or list" hidden>
          <button class="tab-button is-active" id="tab-list" type="button" role="tab" aria-selected="true" aria-controls="panel-list" data-tab="list">List</button>
          <button class="tab-button" id="tab-map" type="button" role="tab" aria-selected="false" aria-controls="panel-map" data-tab="map">Map</button>
        </div>

        <section class="map-results-sheet is-active" id="panel-list" aria-labelledby="spots-heading">
          <div class="spots-header spots-header--sheet">
            <div>
              <p class="eyebrow">Experimental layout</p>
              <h2 id="spots-heading" class="spots-title">Nearby Spots</h2>
              <p class="spots-sub">Map-led search with the list layered as a live bottom sheet.</p>
            </div>
            <div class="live-badge">
              <div class="live-dot"></div>
              <span>Live</span>
            </div>
          </div>
          <div class="results-summary" id="results-summary">No search run yet.</div>
          <div class="card-list card-list--sheet" id="location-list"></div>
        </section>
      </section>

      <section class="contribute-card" aria-labelledby="add-location-heading">
        <div class="contribute-header">
          <div>
            <p class="eyebrow">Contribute</p>
            <h2 id="add-location-heading" class="contribute-title">Add a new Wi-Fi venue</h2>
          </div>
        </div>
        <p class="contribute-copy">Add a venue in under a minute. New locations publish immediately after duplicate review.</p>
        <form class="add-location-form" id="add-location-form">
          <label class="add-location-field" for="add-location-name">
            <span class="manual-label-text">Venue name</span>
            <input class="input-field" id="add-location-name" name="name" autocomplete="off" maxlength="120" placeholder="Shoreditch Study Hall" required>
          </label>
          <label class="add-location-field" for="add-location-category">
            <span class="manual-label-text">Category</span>
            <input class="input-field" id="add-location-category" name="category" autocomplete="off" maxlength="60" placeholder="cafe, library, coworking" required>
          </label>
          <div class="form-feedback" id="add-location-location-summary" aria-live="polite"></div>
          <label class="add-location-field" for="add-location-address">
            <span class="manual-label-text">Address or postcode</span>
            <input class="input-field" id="add-location-address" name="address" autocomplete="street-address" maxlength="220" placeholder="Search or type an address">
          </label>
          <div class="add-location-actions">
            <button class="btn btn-ghost btn-sm" id="add-location-use-current" type="button">Use current area</button>
            <button class="btn btn-ghost btn-sm" id="add-location-place-pin" type="button">Place pin on map</button>
          </div>
          <label class="add-location-field" for="add-location-notes">
            <span class="manual-label-text">Notes (optional)</span>
            <textarea class="input-field input-field-textarea" id="add-location-notes" name="notes" maxlength="500" placeholder="Quiet upstairs tables near plugs."></textarea>
          </label>
          <div class="form-feedback" id="add-location-feedback" aria-live="polite"></div>
          <section class="duplicate-warning" id="add-location-duplicate-warning" hidden aria-live="polite">
            <p class="duplicate-warning-title" id="add-location-duplicate-summary"></p>
            <div class="duplicate-warning-list" id="add-location-duplicate-list"></div>
            <div class="duplicate-warning-actions">
              <button class="btn btn-primary btn-sm" id="add-location-submit-anyway" type="button">Submit anyway</button>
              <button class="btn btn-ghost btn-sm" id="add-location-cancel-warning" type="button">Edit details</button>
            </div>
          </section>
          <button class="btn btn-primary" id="add-location-submit" type="submit">Add venue</button>
        </form>
      </section>

      <section class="cta-card">
        <div class="cta-blur cta-blur-tr"></div>
        <div class="cta-blur cta-blur-bl"></div>
        <h2 class="cta-title">Know a WiFi password?</h2>
        <p class="cta-sub">Share passwords from your favourite spots and help others stay connected wherever they go.</p>
        <p class="cta-note">Submitted Wi-Fi details are public user-generated content.</p>
      </section>

      <footer class="app-footer">
        <div class="footer-logo">
          <div class="footer-logo-circle"><div class="footer-logo-dot"></div></div>
          <span class="footer-logo-text">Wi<span class="logo-accent">Finder</span></span>
        </div>
        <div class="live-badge">
          <div class="live-dot"></div>
          Live
        </div>
        <p class="footer-copy">&copy; 2026 WiFinder. All rights reserved.</p>
      </footer>
    </main>

    <script id="app-bootstrap" type="application/json">${bootstrap}</script>
    <script src="/assets/app.js" defer></script>
  </body>
</html>`;
}

function renderStitchV3AppHtml(config) {
  const bootstrap = serializeBootstrap({
    ...JSON.parse(renderBootstrap(config)),
    autoLocateOnLoad: true
  });

  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml("WiFinder")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700;800&family=Inter:wght@400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/app.css">
  </head>
  <body class="layout-stitch-v3">
    <div class="stitch-shell">
      <nav class="stitch-topbar">
        <div class="stitch-brand">
          <span class="material-symbols-outlined stitch-icon-fill" aria-hidden="true">wifi_find</span>
          <span class="stitch-brand-wordmark">WiFi Connect</span>
        </div>
        <div class="stitch-topbar-actions">
          <a class="stitch-toplink" href="/" aria-label="Open classic home layout">Classic</a>
          <button class="stitch-topicon" id="theme-toggle" type="button" aria-label="Toggle dark mode">
            <svg id="theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <svg id="theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
        </div>
      </nav>

      <main class="stitch-main">
        <div class="stitch-search-stack">
          <div class="stitch-searchbar">
            <span class="material-symbols-outlined stitch-search-icon" aria-hidden="true">search</span>
            <input id="search-input" class="stitch-search-input" type="search" inputmode="search" autocomplete="off" placeholder="Find cafes, bars, or pubs...">
            <button id="search-submit" class="stitch-search-button" type="button">Find</button>
          </div>
          <div class="stitch-chip-row">
            <button class="stitch-chip stitch-chip--active" type="button" data-category-chip="cafe">
              <span class="material-symbols-outlined" aria-hidden="true">coffee</span>
              Cafes
            </button>
            <button class="stitch-chip" type="button" data-category-chip="bar">
              <span class="material-symbols-outlined" aria-hidden="true">sports_bar</span>
              Bars
            </button>
            <button class="stitch-chip" type="button" data-category-chip="pub">
              <span class="material-symbols-outlined" aria-hidden="true">restaurant</span>
              Pubs
            </button>
            <button class="stitch-chip" type="button" data-category-chip="coworking">
              <span class="material-symbols-outlined" aria-hidden="true">work</span>
              Coworking
            </button>
          </div>
        <div class="stitch-filterbar">
            <button class="stitch-utility" id="use-location" type="button">
              <span class="material-symbols-outlined" aria-hidden="true">my_location</span>
              Use my location
            </button>
            <button class="stitch-utility" id="use-fallback" type="button">
              <span class="material-symbols-outlined" aria-hidden="true">near_me</span>
              Central London
            </button>
            <label class="stitch-select-wrap" for="radius-select">
              <span class="material-symbols-outlined" aria-hidden="true">tune</span>
              <select id="radius-select" class="stitch-select">
                ${RADIUS_OPTIONS.map(
                  (radius) =>
                    `<option value="${radius}">${radius < 1000 ? `${radius} m` : `${radius / 1000} km`}</option>`
                ).join("")}
              </select>
            </label>
            <label class="stitch-verified" for="verified-only">
              <input id="verified-only" type="checkbox">
              Verified
            </label>
          </div>
          <input id="category-input" type="hidden" autocomplete="off">
        </div>

        <section class="stitch-map-stage is-active" id="panel-map" aria-label="Map of nearby Wi-Fi venues">
          <div class="stitch-map-backdrop" aria-hidden="true"></div>
          <div class="map-canvas stitch-map-canvas" id="map-canvas"></div>
          <div class="stitch-faux-pin stitch-faux-pin--label">
            <div class="stitch-pin-card">
              <span class="material-symbols-outlined stitch-icon-fill" aria-hidden="true">wifi</span>
              Brew &amp; Co.
            </div>
            <div class="stitch-pin-tail"></div>
          </div>
          <div class="stitch-faux-pin stitch-faux-pin--verified">
            <div class="stitch-pin-card stitch-pin-card--light">
              <span class="material-symbols-outlined stitch-icon-fill stitch-icon-success" aria-hidden="true">check_circle</span>
              The Local Pub
            </div>
            <div class="stitch-pin-tail stitch-pin-tail--light"></div>
          </div>
          <div class="stitch-faux-pin stitch-faux-pin--dot">
            <div class="stitch-pin-bubble">
              <span class="material-symbols-outlined" aria-hidden="true">location_on</span>
            </div>
          </div>
          <div class="map-overlay stitch-map-overlay" id="map-overlay">Use my location or Central London to load the map.</div>
        </section>

        <section class="stitch-results-rail is-active" id="panel-list" aria-labelledby="stitch-results-heading">
          <div class="stitch-results-header">
            <h2 id="stitch-results-heading">Nearby WiFi Spots</h2>
            <button class="stitch-see-all" type="button">See all</button>
          </div>
          <div class="results-summary stitch-results-summary" id="results-summary">No search run yet.</div>
          <div class="card-list stitch-card-rail" id="location-list"></div>
        </section>

        <a class="stitch-fab" href="/v3/add" aria-label="Add WiFi">
          <span class="material-symbols-outlined" aria-hidden="true">add</span>
        </a>

        <div class="tab-list" role="tablist" aria-label="Browse by map or list" hidden>
          <button class="tab-button is-active" id="tab-list" type="button" role="tab" aria-selected="true" aria-controls="panel-list" data-tab="list">List</button>
          <button class="tab-button" id="tab-map" type="button" role="tab" aria-selected="false" aria-controls="panel-map" data-tab="map">Map</button>
        </div>
      </main>

      <nav class="stitch-bottom-nav">
        <a class="stitch-bottom-link stitch-bottom-link--active" href="/v3">
          <span class="material-symbols-outlined" aria-hidden="true">map</span>
          <span>Explore</span>
        </a>
        <a class="stitch-bottom-link" href="/v3/add">
          <span class="material-symbols-outlined" aria-hidden="true">add_circle</span>
          <span>Add WiFi</span>
        </a>
        <a class="stitch-bottom-link" href="#stitch-results-heading">
          <span class="material-symbols-outlined" aria-hidden="true">person</span>
          <span>Profile</span>
        </a>
      </nav>
    </div>

    <script id="app-bootstrap" type="application/json">${bootstrap}</script>
    <script src="/assets/app.js" defer></script>
  </body>
</html>`;
}

function renderStitchV3AddHtml(config) {
  const bootstrap = serializeBootstrap({
    ...JSON.parse(renderBootstrap(config)),
    autoLocateOnLoad: true
  });

  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml("WiFinder Add WiFi")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700;800&family=Inter:wght@400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/app.css">
  </head>
  <body class="layout-stitch-v3">
    <div class="stitch-shell">
      <nav class="stitch-topbar">
        <div class="stitch-brand">
          <span class="material-symbols-outlined stitch-icon-fill" aria-hidden="true">wifi_find</span>
          <span class="stitch-brand-wordmark">WiFi Connect</span>
        </div>
        <div class="stitch-topbar-actions">
          <a class="stitch-toplink" href="/v3" aria-label="Back to v3 home">Explore</a>
          <button class="stitch-topicon" id="theme-toggle" type="button" aria-label="Toggle dark mode">
            <svg id="theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <svg id="theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
        </div>
      </nav>

      <main class="stitch-main stitch-main--add">
        <section class="stitch-add-hero">
          <div>
            <p class="stitch-section-label">Add WiFi</p>
            <h1 class="stitch-add-title">Share a new spot</h1>
            <p class="stitch-add-copy">Pin the venue on the map, then publish it to the community feed.</p>
          </div>
          <div class="stitch-add-mapwrap">
            <section class="stitch-map-stage stitch-map-stage--compact is-active" id="panel-map" aria-label="Map of nearby Wi-Fi venues">
              <div class="stitch-map-backdrop" aria-hidden="true"></div>
              <div class="map-canvas stitch-map-canvas" id="map-canvas"></div>
              <div class="map-overlay stitch-map-overlay" id="map-overlay">Use current area or place a pin on the map to position the new venue.</div>
            </section>
          </div>
        </section>

        <section class="stitch-add-sheet stitch-add-sheet--standalone" aria-labelledby="add-location-heading">
          <div class="stitch-add-header">
            <div>
              <p class="stitch-section-label">Submission</p>
              <h2 id="add-location-heading">Venue details</h2>
            </div>
          </div>
          <form class="stitch-add-form" id="add-location-form">
            <label class="stitch-field" for="add-location-name">
              <span>Venue name</span>
              <input id="add-location-name" class="stitch-input" name="name" autocomplete="off" maxlength="120" placeholder="Artisan Roast House" required>
            </label>
            <label class="stitch-field" for="add-location-category">
              <span>Category</span>
              <input id="add-location-category" class="stitch-input" name="category" autocomplete="off" maxlength="60" placeholder="cafe, bar, pub, coworking" required>
            </label>
            <div class="form-feedback stitch-feedback" id="add-location-location-summary" aria-live="polite"></div>
            <label class="stitch-field" for="add-location-address">
              <span>Address or postcode</span>
              <input id="add-location-address" class="stitch-input" name="address" autocomplete="street-address" maxlength="220" placeholder="Search or type an address">
            </label>
            <div class="stitch-add-actions">
              <button class="stitch-secondary-button" id="add-location-use-current" type="button">Use current area</button>
              <button class="stitch-secondary-button" id="add-location-place-pin" type="button">Place pin on map</button>
            </div>
            <label class="stitch-field" for="add-location-notes">
              <span>Notes</span>
              <textarea id="add-location-notes" class="stitch-input stitch-textarea" name="notes" maxlength="500" placeholder="Fast password, quiet seating, easy plugs."></textarea>
            </label>
            <div class="form-feedback stitch-feedback" id="add-location-feedback" aria-live="polite"></div>
            <section class="duplicate-warning stitch-duplicate" id="add-location-duplicate-warning" hidden aria-live="polite">
              <p class="duplicate-warning-title" id="add-location-duplicate-summary"></p>
              <div class="duplicate-warning-list" id="add-location-duplicate-list"></div>
              <div class="duplicate-warning-actions">
                <button class="stitch-primary-button" id="add-location-submit-anyway" type="button">Submit anyway</button>
                <button class="stitch-secondary-button" id="add-location-cancel-warning" type="button">Edit details</button>
              </div>
            </section>
            <button class="stitch-primary-button stitch-primary-button--full" id="add-location-submit" type="submit">Publish spot</button>
          </form>
        </section>

        <input id="search-input" type="hidden" value="">
        <input id="category-input" type="hidden" value="">
        <select id="radius-select" hidden>${RADIUS_OPTIONS.map((radius) => `<option value="${radius}">${radius}</option>`).join("")}</select>
        <input id="verified-only" type="checkbox" hidden>
        <button id="use-location" type="button" hidden>Use location</button>
        <button id="use-fallback" type="button" hidden>Use fallback</button>
        <div id="results-summary" hidden>No search run yet.</div>
        <div id="location-list" hidden></div>
        <div class="tab-list" role="tablist" aria-label="Browse by map or list" hidden>
          <button class="tab-button is-active" id="tab-list" type="button" role="tab" aria-selected="true" aria-controls="panel-list" data-tab="list">List</button>
          <button class="tab-button" id="tab-map" type="button" role="tab" aria-selected="false" aria-controls="panel-map" data-tab="map">Map</button>
        </div>
        <div id="panel-list" hidden></div>
      </main>

      <nav class="stitch-bottom-nav">
        <a class="stitch-bottom-link" href="/v3">
          <span class="material-symbols-outlined" aria-hidden="true">map</span>
          <span>Explore</span>
        </a>
        <a class="stitch-bottom-link stitch-bottom-link--active" href="/v3/add">
          <span class="material-symbols-outlined" aria-hidden="true">add_circle</span>
          <span>Add WiFi</span>
        </a>
        <a class="stitch-bottom-link" href="/v3">
          <span class="material-symbols-outlined" aria-hidden="true">person</span>
          <span>Profile</span>
        </a>
      </nav>
    </div>

    <script id="app-bootstrap" type="application/json">${bootstrap}</script>
    <script src="/assets/app.js" defer></script>
  </body>
</html>`;
}

export function tryServeWebRoute({ pathname, res, config, responseHeaders }) {
  if (pathname === "/") {
    send(res, 200, renderClassicAppHtml(config), "text/html; charset=utf-8", responseHeaders);
    return true;
  }

  if (pathname === "/v2") {
    send(res, 200, renderMapLayoutAppHtml(config), "text/html; charset=utf-8", responseHeaders);
    return true;
  }

  if (pathname === "/v3") {
    send(res, 200, renderStitchV3AppHtml(config), "text/html; charset=utf-8", responseHeaders);
    return true;
  }

  if (pathname === "/v3/add") {
    send(res, 200, renderStitchV3AddHtml(config), "text/html; charset=utf-8", responseHeaders);
    return true;
  }

  if (pathname === "/assets/app.css") {
    send(res, 200, APP_CSS, "text/css; charset=utf-8", responseHeaders);
    return true;
  }

  if (pathname === "/assets/app.js") {
    send(res, 200, APP_JS, "application/javascript; charset=utf-8", responseHeaders);
    return true;
  }

  return false;
}
