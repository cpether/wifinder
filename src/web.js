import fs from "node:fs";
import { send } from "./http.js";

const APP_JS = fs.readFileSync(new URL("./web/app.js", import.meta.url), "utf8");
const APP_CSS = fs.readFileSync(new URL("./web/app.css", import.meta.url), "utf8");

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
    defaultRadius: 2000,
    fallbackCenter: {
      lat: 51.5072,
      lng: -0.1276,
      label: "Central London"
    }
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml("WiFinder")}</title>
    <link rel="stylesheet" href="/assets/app.css">
  </head>
  <body>
    <main class="app-shell">
      <section class="hero-panel">
        <p class="eyebrow">WiFinder</p>
        <h1>Find nearby Wi-Fi without the scroll hunt.</h1>
        <p class="hero-copy">
          Use your location or a fallback center to browse nearby venues, then switch between a quick list and a map view built for mobile.
        </p>
        <div class="action-row">
          <button class="action-button action-button-primary" id="use-location" type="button">Use my location</button>
          <button class="action-button" id="use-fallback" type="button">Use Central London</button>
        </div>
        <form class="manual-entry" id="manual-location-form">
          <label>
            Latitude
            <input id="manual-lat" inputmode="decimal" name="lat" placeholder="51.5072" required>
          </label>
          <label>
            Longitude
            <input id="manual-lng" inputmode="decimal" name="lng" placeholder="-0.1276" required>
          </label>
          <button class="action-button manual-submit" type="submit">Search this area</button>
        </form>
        <p class="privacy-note">
          Geolocation stays in your browser for nearby search. Submitted Wi-Fi details are public user-generated content.
        </p>
      </section>

      <section class="results-shell" aria-labelledby="results-heading">
        <div class="results-header">
          <div>
            <p class="section-label">Nearby venues</p>
            <h2 id="results-heading">Browse by map or list</h2>
          </div>
          <div class="tab-list" role="tablist" aria-label="Nearby results view">
            <button class="tab-button is-active" id="tab-list" type="button" role="tab" aria-selected="true" aria-controls="panel-list" data-tab="list">List</button>
            <button class="tab-button" id="tab-map" type="button" role="tab" aria-selected="false" aria-controls="panel-map" data-tab="map">Map</button>
          </div>
        </div>

        <div class="status-banner" id="status-banner" aria-live="polite">Choose a location to load nearby venues.</div>

        <section class="panel panel-list is-active" id="panel-list" role="tabpanel" aria-labelledby="tab-list">
          <div class="results-summary" id="results-summary">No search run yet.</div>
          <div class="card-list" id="location-list"></div>
        </section>

        <section class="panel panel-map" id="panel-map" role="tabpanel" aria-labelledby="tab-map" hidden>
          <div class="map-frame">
            <div class="map-canvas" id="map-canvas" aria-label="Map of nearby Wi-Fi venues"></div>
            <div class="map-overlay" id="map-overlay">Switch to map after loading a nearby search.</div>
          </div>
        </section>
      </section>
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
