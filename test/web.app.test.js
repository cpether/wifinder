import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

class FakeClassList {
  constructor() {
    this.tokens = new Set();
  }

  toggle(name, force) {
    if (force) {
      this.tokens.add(name);
      return;
    }

    this.tokens.delete(name);
  }
}

class FakeElement {
  constructor({ dataset = {}, textContent = "" } = {}) {
    this.dataset = dataset;
    this.textContent = textContent;
    this.value = "";
    this.checked = false;
    this.innerHTML = "";
    this.hidden = false;
    this.classList = new FakeClassList();
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type, event = {}) {
    const listener = this.listeners.get(type);
    assert.ok(listener, `Missing ${type} listener`);
    listener({
      target: this,
      currentTarget: this,
      preventDefault() {},
      ...event
    });
  }

  setAttribute() {}
}

function createEnvironment() {
  const bootstrapElement = new FakeElement({
    textContent: JSON.stringify({
      googleMapsApiKey: null,
      nearbyEndpoint: "/api/locations/nearby",
      searchEndpoint: "/api/locations/search",
      defaultRadius: 2000,
      fallbackCenter: {
        lat: 51.5072,
        lng: -0.1276,
        label: "Central London"
      }
    })
  });

  const elements = {
    "app-bootstrap": bootstrapElement,
    "use-location": new FakeElement(),
    "use-fallback": new FakeElement(),
    "manual-location-form": new FakeElement(),
    "manual-lat": new FakeElement(),
    "manual-lng": new FakeElement(),
    "search-input": new FakeElement(),
    "filter-form": new FakeElement(),
    "filter-category": new FakeElement(),
    "filter-radius": new FakeElement(),
    "filter-verified": new FakeElement(),
    "clear-filters": new FakeElement(),
    "status-banner": new FakeElement(),
    "results-summary": new FakeElement(),
    "location-list": new FakeElement(),
    "map-canvas": new FakeElement(),
    "map-overlay": new FakeElement(),
    "panel-list": new FakeElement(),
    "panel-map": new FakeElement()
  };

  const tabButtons = [new FakeElement({ dataset: { tab: "list" } }), new FakeElement({ dataset: { tab: "map" } })];
  const document = {
    getElementById(id) {
      return elements[id] ?? null;
    },
    querySelectorAll(selector) {
      return selector === "[data-tab]" ? tabButtons : [];
    },
    createElement() {
      return new FakeElement();
    },
    head: {
      appendChild() {}
    }
  };

  return { document, elements };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("client search input debounces requests and preserves the current map center", async () => {
  const script = await fs.readFile(new URL("../src/web/app.js", import.meta.url), "utf8");
  const { document, elements } = createEnvironment();
  const fetchCalls = [];

  const context = {
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
    Intl,
    setTimeout,
    clearTimeout,
    console
  };
  context.window = context;

  vm.runInNewContext(script, context);

  elements["use-fallback"].dispatch("click");
  await delay(0);
  assert.equal(fetchCalls.length, 1);

  fetchCalls.length = 0;

  elements["search-input"].value = "shore";
  elements["search-input"].dispatch("input");
  await delay(150);

  elements["search-input"].value = "shoreditch";
  elements["search-input"].dispatch("input");
  await delay(200);
  assert.equal(fetchCalls.length, 0);

  await delay(150);
  assert.equal(fetchCalls.length, 1);

  const requestUrl = new URL(fetchCalls[0], "http://localhost");
  assert.equal(requestUrl.pathname, "/api/locations/search");
  assert.equal(requestUrl.searchParams.get("q"), "shoreditch");
  assert.equal(requestUrl.searchParams.get("lat"), "51.5072");
  assert.equal(requestUrl.searchParams.get("lng"), "-0.1276");
  assert.equal(requestUrl.searchParams.get("radius"), "2000");
});

test("client filter controls pass category and radius to nearby lookups and switch verified lookups to search", async () => {
  const script = await fs.readFile(new URL("../src/web/app.js", import.meta.url), "utf8");
  const { document, elements } = createEnvironment();
  const fetchCalls = [];

  const context = {
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
    Intl,
    setTimeout,
    clearTimeout,
    console
  };
  context.window = context;

  vm.runInNewContext(script, context);

  elements["use-fallback"].dispatch("click");
  await delay(0);
  fetchCalls.length = 0;

  elements["filter-radius"].value = "5000";
  elements["filter-radius"].dispatch("change");
  await delay(0);

  let requestUrl = new URL(fetchCalls.at(-1), "http://localhost");
  assert.equal(requestUrl.pathname, "/api/locations/nearby");
  assert.equal(requestUrl.searchParams.get("radius"), "5000");
  assert.equal(requestUrl.searchParams.get("category"), null);
  assert.equal(requestUrl.searchParams.get("verified"), null);

  elements["filter-category"].value = "coworking";
  elements["filter-category"].dispatch("change");
  await delay(0);

  requestUrl = new URL(fetchCalls.at(-1), "http://localhost");
  assert.equal(requestUrl.pathname, "/api/locations/nearby");
  assert.equal(requestUrl.searchParams.get("radius"), "5000");
  assert.equal(requestUrl.searchParams.get("category"), "coworking");

  elements["filter-verified"].checked = true;
  elements["filter-verified"].dispatch("change");
  await delay(0);

  requestUrl = new URL(fetchCalls.at(-1), "http://localhost");
  assert.equal(requestUrl.pathname, "/api/locations/search");
  assert.equal(requestUrl.searchParams.get("lat"), "51.5072");
  assert.equal(requestUrl.searchParams.get("lng"), "-0.1276");
  assert.equal(requestUrl.searchParams.get("radius"), "5000");
  assert.equal(requestUrl.searchParams.get("category"), "coworking");
  assert.equal(requestUrl.searchParams.get("verified"), "true");

  elements["clear-filters"].dispatch("click");
  await delay(0);

  requestUrl = new URL(fetchCalls.at(-1), "http://localhost");
  assert.equal(requestUrl.pathname, "/api/locations/nearby");
  assert.equal(requestUrl.searchParams.get("radius"), "2000");
  assert.equal(requestUrl.searchParams.get("category"), null);
  assert.equal(requestUrl.searchParams.get("verified"), null);
});
