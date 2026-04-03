import test from "node:test";
import assert from "node:assert/strict";
import { tryServeWebRoute } from "../src/web.js";

function renderPath(pathname) {
  let statusCode = null;
  let headers = null;
  let body = "";
  const res = {
    writeHead(status, nextHeaders) {
      statusCode = status;
      headers = nextHeaders;
    },
    end(chunk) {
      body = chunk;
    }
  };

  const served = tryServeWebRoute({
    pathname,
    res,
    config: {
      googleMapsApiKey: null
    },
    responseHeaders: {}
  });

  return { served, statusCode, headers, body };
}

test("web route renderer serves v3 Stitch-inspired home shell", () => {
  const response = renderPath("/v3");

  assert.equal(response.served, true);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
  assert.match(response.body, /class="layout-stitch-v3 layout-stitch-v3-home"/);
  assert.match(response.body, /Wi<span class="logo-accent">Finder<\/span>/);
  assert.match(response.body, /Find cafes, bars, or pubs/);
  assert.match(response.body, /results near you/);
  assert.match(response.body, /id="map-canvas"/);
  assert.match(response.body, /id="search-input"/);
  assert.match(response.body, /data-category-chip="cafe"/);
  assert.doesNotMatch(response.body, /id="add-location-form"/);
  assert.doesNotMatch(response.body, /id="status-banner"/);
  assert.match(response.body, /"autoLocateOnLoad":true/);
  assert.match(response.body, /"mapGestureHandling":"greedy"/);
});

test("web route renderer serves dedicated v3 add screen", () => {
  const response = renderPath("/v3\\/add".replace("\\/", "/"));

  assert.equal(response.served, true);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
  assert.match(response.body, /Add network details/);
  assert.match(response.body, /id="add-location-form"/);
  assert.match(response.body, /id="add-location-ssid"/);
  assert.match(response.body, /id="add-location-password"/);
  assert.match(response.body, /data-bwignore="true"/);
  assert.match(response.body, /data-1p-ignore="true"/);
  assert.match(response.body, /type="password"/);
  assert.match(response.body, /readonly/);
  assert.match(response.body, /id="map-canvas"/);
  assert.match(response.body, /"autoLocateOnLoad":true/);
});

test("web route renderer serves dedicated v3 add success screen", () => {
  const response = renderPath("/v3/add/success");

  assert.equal(response.served, true);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
  assert.match(response.body, /WiFi added successfully/);
  assert.match(response.body, /Back to map/);
});
