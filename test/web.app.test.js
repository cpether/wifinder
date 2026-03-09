import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const APP_SOURCE = fs.readFileSync(new URL("../src/web/app.js", import.meta.url), "utf8");

function createElement({ id = null, dataset = {} } = {}) {
  return {
    id,
    dataset,
    value: "",
    checked: false,
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

function createHarness({ search = "" } = {}) {
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
    clearTimeout() {}
  };

  const context = vm.createContext({
    window,
    document,
    navigator: {},
    fetch: async (url) => {
      fetchCalls.push(url);
      return {
        ok: true,
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
    historyCalls
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
  const requestUrl = new URL(harness.fetchCalls[0], "http://localhost");
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
