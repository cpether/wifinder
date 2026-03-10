import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { setImmediate as flushImmediate } from "node:timers/promises";

const APP_SOURCE = fs.readFileSync(new URL("../src/web/app.js", import.meta.url), "utf8");

function createElement({ id = null, dataset = {} } = {}) {
  return {
    id,
    dataset,
    value: "",
    checked: false,
    disabled: false,
    hidden: false,
    innerHTML: "",
    textContent: "",
    attributes: {},
    listeners: new Map(),
    classList: {
      toggle() {}
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    dispatch(type, event = {}) {
      const handler = this.listeners.get(type);
      if (handler) {
        handler({
          preventDefault() {},
          ...event
        });
      }
    }
  };
}

function createHarness({ search = "", fetchImpl } = {}) {
  const tabList = createElement({ id: "tab-list", dataset: { tab: "list" } });
  const tabMap = createElement({ id: "tab-map", dataset: { tab: "map" } });

  const elements = {
    "app-bootstrap": createElement({ id: "app-bootstrap" }),
    "use-location": createElement({ id: "use-location" }),
    "use-fallback": createElement({ id: "use-fallback" }),
    "manual-location-form": createElement({ id: "manual-location-form" }),
    "manual-lat": createElement({ id: "manual-lat" }),
    "manual-lng": createElement({ id: "manual-lng" }),
    "search-input": createElement({ id: "search-input" }),
    "category-input": createElement({ id: "category-input" }),
    "radius-select": createElement({ id: "radius-select" }),
    "verified-only": createElement({ id: "verified-only" }),
    "add-location-form": createElement({ id: "add-location-form" }),
    "add-location-name": createElement({ id: "add-location-name" }),
    "add-location-category": createElement({ id: "add-location-category" }),
    "add-location-lat": createElement({ id: "add-location-lat" }),
    "add-location-lng": createElement({ id: "add-location-lng" }),
    "add-location-address": createElement({ id: "add-location-address" }),
    "add-location-notes": createElement({ id: "add-location-notes" }),
    "add-location-use-center": createElement({ id: "add-location-use-center" }),
    "add-location-feedback": createElement({ id: "add-location-feedback" }),
    "add-location-duplicate-warning": createElement({ id: "add-location-duplicate-warning" }),
    "add-location-duplicate-summary": createElement({ id: "add-location-duplicate-summary" }),
    "add-location-duplicate-list": createElement({ id: "add-location-duplicate-list" }),
    "add-location-submit": createElement({ id: "add-location-submit" }),
    "add-location-submit-anyway": createElement({ id: "add-location-submit-anyway" }),
    "add-location-cancel-warning": createElement({ id: "add-location-cancel-warning" }),
    "status-banner": createElement({ id: "status-banner" }),
    "results-summary": createElement({ id: "results-summary" }),
    "location-list": createElement({ id: "location-list" }),
    "map-canvas": createElement({ id: "map-canvas" }),
    "map-overlay": createElement({ id: "map-overlay" }),
    "panel-list": createElement({ id: "panel-list" }),
    "panel-map": createElement({ id: "panel-map" })
  };

  elements["app-bootstrap"].textContent = JSON.stringify({
    googleMapsApiKey: null,
    nearbyEndpoint: "/api/locations/nearby",
    searchEndpoint: "/api/locations/search",
    createLocationEndpoint: "/api/locations",
    searchDebounceMs: 300,
    defaultRadius: 2000,
    radiusOptions: [500, 1000, 2000, 5000, 10000],
    fallbackCenter: {
      lat: 51.5072,
      lng: -0.1276,
      label: "Central London"
    }
  });

  const fetchCalls = [];
  const historyCalls = [];
  const storage = new Map();

  const document = {
    getElementById(id) {
      return elements[id] ?? null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-tab]") {
        return [tabList, tabMap];
      }
      return [];
    },
    createElement() {
      return createElement();
    },
    head: {
      appendChild() {}
    }
  };

  const window = {
    location: {
      pathname: "/",
      search
    },
    history: {
      replaceState(_state, _title, url) {
        historyCalls.push(url);
      }
    },
    setTimeout(handler) {
      handler();
      return 1;
    },
    clearTimeout() {},
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    }
  };

  const context = vm.createContext({
    window,
    document,
    navigator: {},
    fetch: fetchImpl
      ? async (url, options) => {
          fetchCalls.push({ url, options });
          return fetchImpl(url, options);
        }
      : async (url, options) => {
          fetchCalls.push({ url, options });
          return {
            ok: true,
            headers: {
              get() {
                return null;
              }
            },
            async json() {
              return { locations: [] };
            }
          };
        },
    URLSearchParams,
    URL,
    Intl,
    console
  });

  vm.runInContext(APP_SOURCE, context);

  return {
    elements,
    fetchCalls,
    historyCalls,
    storage
  };
}

test("web app restores deep-linked search filters into controls and the initial API request", async () => {
  const harness = createHarness({
    search: "?q=camden&category=cafe&radius=5000&verified=true&lat=51.5072&lng=-0.1276&label=Central%20London"
  });

  assert.equal(harness.elements["search-input"].value, "camden");
  assert.equal(harness.elements["category-input"].value, "cafe");
  assert.equal(harness.elements["radius-select"].value, "5000");
  assert.equal(harness.elements["verified-only"].checked, true);
  assert.equal(harness.elements["manual-lat"].value, "51.5072");
  assert.equal(harness.elements["manual-lng"].value, "-0.1276");

  assert.equal(harness.fetchCalls.length, 1);
  const requestUrl = new URL(harness.fetchCalls[0].url, "http://localhost");
  assert.equal(requestUrl.pathname, "/api/locations/search");
  assert.equal(requestUrl.searchParams.get("q"), "camden");
  assert.equal(requestUrl.searchParams.get("category"), "cafe");
  assert.equal(requestUrl.searchParams.get("radius"), "5000");
  assert.equal(requestUrl.searchParams.get("verified"), "true");
  assert.equal(requestUrl.searchParams.get("lat"), "51.5072");
  assert.equal(requestUrl.searchParams.get("lng"), "-0.1276");

  assert.deepEqual(harness.historyCalls, [
    "/?q=camden&category=cafe&radius=5000&verified=true&lat=51.5072&lng=-0.1276&label=Central+London"
  ]);
});

test("web app submits a new location, surfaces duplicate warnings, and reuses the stored device token", async () => {
  let requestCount = 0;
  const harness = createHarness({
    fetchImpl: async (_url, options) => {
      requestCount += 1;
      if (requestCount === 1) {
        return {
          ok: false,
          status: 409,
          headers: {
            get(name) {
              return name === "x-device-token" ? "device-token-1" : null;
            }
          },
          async json() {
            return {
              error: {
                message: "Potential duplicate location",
                details: {
                  duplicates: [
                    {
                      id: 9,
                      name: "Shoreditch Study Hall",
                      category: "coworking",
                      address: "Old Street, London",
                      distance_m: 42
                    }
                  ]
                }
              }
            };
          }
        };
      }

      return {
        ok: true,
        status: 201,
        headers: {
          get(name) {
            return name === "x-device-token" ? "device-token-1" : null;
          }
        },
        async json() {
          return {
            location: {
              id: 12,
              name: "Shoreditch Study Hall",
              category: "coworking",
              lat: 51.5255,
              lng: -0.076,
              address: "Old Street, London",
              wifi_confidence: 0,
              freshness_badge: "Unknown",
              last_verified_at: null
            }
          };
        }
      };
    }
  });

  harness.elements["add-location-name"].value = "Shoreditch Study Hall";
  harness.elements["add-location-category"].value = "coworking";
  harness.elements["add-location-lat"].value = "51.5255";
  harness.elements["add-location-lng"].value = "-0.076";
  harness.elements["add-location-address"].value = "Old Street, London";

  harness.elements["add-location-form"].dispatch("submit");
  await flushImmediate();

  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.elements["add-location-duplicate-warning"].hidden, false);
  assert.match(harness.elements["add-location-duplicate-list"].innerHTML, /Shoreditch Study Hall/);
  assert.equal(harness.storage.get("wifinder-device-token"), "device-token-1");

  harness.elements["add-location-submit-anyway"].dispatch("click");
  await flushImmediate();

  assert.equal(harness.fetchCalls.length, 2);
  const secondRequestBody = JSON.parse(harness.fetchCalls[1].options.body);
  assert.equal(secondRequestBody.ignore_duplicate_warning, true);
  assert.equal(harness.fetchCalls[1].options.headers["x-device-token"], "device-token-1");
  assert.equal(harness.elements["add-location-duplicate-warning"].hidden, true);
  assert.match(harness.elements["add-location-feedback"].textContent, /now live/);
  assert.match(harness.elements["location-list"].innerHTML, /Shoreditch Study Hall/);
});
