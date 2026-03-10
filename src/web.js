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

function renderAppHtml(config) {
  const bootstrap = serializeBootstrap({
    googleMapsApiKey: config.googleMapsApiKey,
    nearbyEndpoint: "/api/locations/nearby",
    searchEndpoint: "/api/locations/search",
    searchDebounceMs: 300,
    defaultRadius: DEFAULT_RADIUS,
    radiusOptions: RADIUS_OPTIONS,
    fallbackCenter: {
      lat: 51.5072,
      lng: -0.1276,
      label: "Central London"
    }
  });

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

      <!-- ══════ MANUAL COORDINATES (collapsible) ══════ -->
      <details class="manual-details">
        <summary class="manual-summary">Enter coordinates manually</summary>
        <form class="manual-form" id="manual-location-form">
          <label>
            <span class="manual-label-text">Latitude</span>
            <input class="input-field" id="manual-lat" inputmode="decimal" name="lat" placeholder="51.5072" required>
          </label>
          <label>
            <span class="manual-label-text">Longitude</span>
            <input class="input-field" id="manual-lng" inputmode="decimal" name="lng" placeholder="-0.1276" required>
          </label>
          <button class="btn btn-primary btn-sm" type="submit">Go</button>
        </form>
      </details>

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

export function tryServeWebRoute({ pathname, res, config, responseHeaders }) {
  if (pathname === "/") {
    send(res, 200, renderAppHtml(config), "text/html; charset=utf-8", responseHeaders);
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
