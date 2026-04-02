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
  assert.match(response.body, /WiFi Connect/);
  assert.match(response.body, /Find cafes, bars, or pubs/);
  assert.match(response.body, /Nearby WiFi Spots/);
  assert.match(response.body, /id="map-canvas"/);
  assert.match(response.body, /id="search-input"/);
  assert.match(response.body, /data-category-chip="cafe"/);
  assert.doesNotMatch(response.body, /id="add-location-form"/);
  assert.doesNotMatch(response.body, /id="status-banner"/);
  assert.match(response.body, /"autoLocateOnLoad":true/);
});

test("web route renderer serves dedicated v3 add screen", () => {
  const response = renderPath("/v3\\/add".replace("\\/", "/"));

  assert.equal(response.served, true);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
  assert.match(response.body, /Share a new spot/);
  assert.match(response.body, /id="add-location-form"/);
  assert.match(response.body, /id="add-location-place-pin"/);
  assert.match(response.body, /id="map-canvas"/);
  assert.match(response.body, /"autoLocateOnLoad":true/);
});
