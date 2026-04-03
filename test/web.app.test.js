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
    style: {},
    attributes: {},
    children: [],
    parentNode: null,
    listeners: new Map(),
    classList: {
      toggle() {}
    },
    appendChild(child) {
      if (!child) {
        return child;
      }
      if (child.parentNode && typeof child.parentNode.removeChild === "function") {
        child.parentNode.removeChild(child);
      }
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
      if (child) {
        child.parentNode = null;
      }
      return child;
    },
    remove() {
      if (this.parentNode && typeof this.parentNode.removeChild === "function") {
        this.parentNode.removeChild(this);
      }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    removeAttribute(name) {
      delete this.attributes[name];
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

function createGoogleMapsStub({
  placeDetailsById = {},
  containerPixelForLatLng,
  divPixelForLatLng
} = {}) {
  const createdMaps = [];
  const createdMarkers = [];
  const createdAutocompletes = [];
  const createdInfoWindows = [];

  class FakeMap {
    constructor(_element, options) {
      this.center = options.center;
      this.zoom = options.zoom;
      this.options = options;
      this.listeners = new Map();
      this.overlayViews = new Set();
      this.panes = {
        floatPane: createElement({ id: "map-float-pane" }),
        overlayMouseTarget: createElement({ id: "map-overlay-mouse-target" }),
        overlayLayer: createElement({ id: "map-overlay-layer" })
      };
      createdMaps.push(this);
    }

    addListener(event, handler) {
      this.listeners.set(event, handler);
    }

    redrawOverlays() {
      for (const overlayView of this.overlayViews) {
        if (typeof overlayView.draw === "function") {
          overlayView.draw();
        }
      }
    }

    getCenter() {
      return this.center;
    }

    getZoom() {
      return this.zoom;
    }

    setCenter(center) {
      this.center = center;
      this.redrawOverlays();
    }

    setZoom(zoom) {
      this.zoom = zoom;
      this.redrawOverlays();
    }

    fitBounds(bounds, padding) {
      this.lastFitBounds = { bounds, padding };
      this.center = { lat: -999, lng: -999 };
      this.redrawOverlays();
    }

    panTo(center) {
      this.center = center;
      this.redrawOverlays();
    }

    trigger(event, payload) {
      const handler = this.listeners.get(event);
      if (handler) {
        handler(payload);
      }
    }
  }

  class FakeMarker {
    constructor(options) {
      this.map = options.map;
      this.position = options.position;
      this.title = options.title;
      this.icon = options.icon;
      this.listeners = new Map();
      createdMarkers.push(this);
    }

    setMap(map) {
      this.map = map;
    }

    addListener(event, handler) {
      this.listeners.set(event, handler);
    }

    trigger(event, payload) {
      const handler = this.listeners.get(event);
      if (handler) {
        handler(payload);
      }
    }
  }

  class FakeAdvancedMarkerElement {
    constructor(options) {
      this.map = options.map;
      this.position = options.position;
      this.title = options.title;
      this.content = options.content;
      this.listeners = new Map();
      createdMarkers.push(this);
    }

    addEventListener(event, handler) {
      this.listeners.set(event, handler);
    }

    trigger(event, payload) {
      const handler = this.listeners.get(event);
      if (handler) {
        handler(payload);
      }
    }
  }

  class FakePinElement {
    constructor() {
      this.element = {};
    }
  }

  class FakeInfoWindow {
    constructor(options = {}) {
      this.options = options;
      this.content = "";
      this.openArgs = null;
      createdInfoWindows.push(this);
    }

    setContent(content) {
      this.content = content;
    }

    open(args) {
      this.openArgs = args;
    }

    close() {}
  }

  class FakeLatLng {
    constructor(lat, lng) {
      this._lat = lat;
      this._lng = lng;
    }

    lat() {
      return this._lat;
    }

    lng() {
      return this._lng;
    }
  }

  class FakeOverlayView {
    constructor() {
      this.map = null;
    }

    setMap(map) {
      if (this.map && this.map !== map) {
        this.map.overlayViews.delete(this);
        if (typeof this.onRemove === "function") {
          this.onRemove();
        }
      }

      if (!map) {
        if (this.map) {
          this.map.overlayViews.delete(this);
        }
        this.map = null;
        if (typeof this.onRemove === "function") {
          this.onRemove();
        }
        return;
      }

      this.map = map;
      map.overlayViews.add(this);
      if (typeof this.onAdd === "function") {
        this.onAdd();
      }
      if (typeof this.draw === "function") {
        this.draw();
      }
    }

    getPanes() {
      return this.map?.panes ?? null;
    }

    getProjection() {
      return {
        fromLatLngToContainerPixel(latLng) {
          if (typeof containerPixelForLatLng === "function") {
            return containerPixelForLatLng(latLng);
          }

          const lat = typeof latLng?.lat === "function" ? latLng.lat() : latLng?.lat;
          const lng = typeof latLng?.lng === "function" ? latLng.lng() : latLng?.lng;
          return {
            x: Math.round(((Number(lng) + 180) / 360) * 320),
            y: Math.round(((90 - Number(lat)) / 180) * 180)
          };
        },
        fromLatLngToDivPixel: (latLng) => {
          if (typeof divPixelForLatLng === "function") {
            return divPixelForLatLng(latLng, this.map);
          }

          const lat = typeof latLng?.lat === "function" ? latLng.lat() : latLng?.lat;
          const lng = typeof latLng?.lng === "function" ? latLng.lng() : latLng?.lng;
          return {
            x: Math.round((Number(lng) + 180) * 2),
            y: Math.round((90 - Number(lat)) * 2)
          };
        }
      };
    }
  }

  class FakeLatLngBounds {
    extend() {}
  }

  class FakeGeocoder {
    geocode(_request, callback) {
      callback([{ formatted_address: "Pinned venue address" }], "OK");
    }
  }

  class FakeAutocomplete {
    constructor(_element, _options) {
      this.listeners = new Map();
      this.place = null;
      createdAutocompletes.push(this);
    }

    addListener(event, handler) {
      this.listeners.set(event, handler);
    }

    getPlace() {
      return this.place;
    }

    triggerPlace(place) {
      this.place = place;
      const handler = this.listeners.get("place_changed");
      if (handler) {
        handler();
      }
    }
  }

  class FakePlace {
    constructor({ id } = {}) {
      this.id = id;
      this.displayName = null;
      this.formattedAddress = null;
      this.location = null;
    }

    async fetchFields(_request) {
      const details = placeDetailsById[this.id] ?? null;
      if (!details) {
        throw new Error("NOT_FOUND");
      }

      this.displayName = details.displayName ?? details.name ?? null;
      this.formattedAddress = details.formattedAddress ?? details.formatted_address ?? null;
      this.location = details.location ?? details.geometry?.location ?? null;
    }

    static async searchByText() {
      return { places: [] };
    }
  }

  return {
    google: {
      maps: {
        Map: FakeMap,
        Marker: FakeMarker,
        InfoWindow: FakeInfoWindow,
        OverlayView: FakeOverlayView,
        LatLng: FakeLatLng,
        LatLngBounds: FakeLatLngBounds,
        Geocoder: FakeGeocoder,
        importLibrary: async (name) => {
          if (name === "core") {
            return {
              ColorScheme: {
                LIGHT: "LIGHT",
                DARK: "DARK",
                FOLLOW_SYSTEM: "FOLLOW_SYSTEM"
              }
            };
          }
          if (name === "marker") {
            return {
              AdvancedMarkerElement: FakeAdvancedMarkerElement,
              PinElement: FakePinElement
            };
          }
          if (name === "places") {
            return {
              Place: FakePlace,
              SearchByTextRankPreference: {
                RELEVANCE: "RELEVANCE"
              }
            };
          }
          return {};
        },
        places: {
          Autocomplete: FakeAutocomplete,
          Place: FakePlace
        }
      }
    },
    createdMaps,
    createdMarkers,
    createdAutocompletes,
    createdInfoWindows
  };
}

function createHarness({
  search = "",
  fetchImpl,
  bootstrapOverrides = {},
  google = undefined,
  navigatorOverride = {},
  includeAddLocationUi = true
} = {}) {
  const tabList = createElement({ id: "tab-list", dataset: { tab: "list" } });
  const tabMap = createElement({ id: "tab-map", dataset: { tab: "map" } });

  const elements = {
    "app-bootstrap": createElement({ id: "app-bootstrap" }),
    "theme-toggle": createElement({ id: "theme-toggle" }),
    "theme-icon-sun": createElement({ id: "theme-icon-sun" }),
    "theme-icon-moon": createElement({ id: "theme-icon-moon" }),
    "use-location": createElement({ id: "use-location" }),
    "use-fallback": createElement({ id: "use-fallback" }),
    "search-input": createElement({ id: "search-input" }),
    "category-input": createElement({ id: "category-input" }),
    "radius-select": createElement({ id: "radius-select" }),
    "verified-only": createElement({ id: "verified-only" }),
    "add-location-form": createElement({ id: "add-location-form" }),
    "add-location-name": createElement({ id: "add-location-name" }),
    "add-location-category": createElement({ id: "add-location-category" }),
    "add-location-location-summary": createElement({ id: "add-location-location-summary" }),
    "add-location-address": createElement({ id: "add-location-address" }),
    "add-location-use-current": createElement({ id: "add-location-use-current" }),
    "add-location-place-pin": createElement({ id: "add-location-place-pin" }),
    "add-location-notes": createElement({ id: "add-location-notes" }),
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

  const mapFrame = createElement({ id: "map-frame" });
  mapFrame.appendChild(elements["map-canvas"]);
  mapFrame.appendChild(elements["map-overlay"]);
  elements["panel-map"].appendChild(mapFrame);

  if (!includeAddLocationUi) {
    for (const id of [
      "add-location-form",
      "add-location-name",
      "add-location-category",
      "add-location-location-summary",
      "add-location-address",
      "add-location-use-current",
      "add-location-place-pin",
      "add-location-notes",
      "add-location-feedback",
      "add-location-duplicate-warning",
      "add-location-duplicate-summary",
      "add-location-duplicate-list",
      "add-location-submit",
      "add-location-submit-anyway",
      "add-location-cancel-warning"
    ]) {
      delete elements[id];
    }
  }

  elements["map-canvas"].clientWidth = 360;
  elements["map-canvas"].clientHeight = 224;
  elements["map-overlay"].offsetWidth = 220;
  elements["map-overlay"].offsetHeight = 96;

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
    },
    ...bootstrapOverrides
  });

  const fetchCalls = [];
  const historyCalls = [];
  const storage = new Map();

  const document = {
    documentElement: {
      attributes: {
        "data-theme": "light"
      },
      getAttribute(name) {
        return this.attributes[name] ?? null;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      }
    },
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

  if (google) {
    window.google = google;
  }

  const context = vm.createContext({
    window,
    document,
    navigator: navigatorOverride,
    google,
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

test("web app can auto-locate on load when configured", async () => {
  const geolocationCalls = [];
  const harness = createHarness({
    bootstrapOverrides: {
      autoLocateOnLoad: true
    },
    navigatorOverride: {
      geolocation: {
        getCurrentPosition(success) {
          geolocationCalls.push("called");
          success({
            coords: {
              latitude: 51.5007,
              longitude: -0.1246
            }
          });
        }
      }
    }
  });

  await flushImmediate();

  assert.equal(geolocationCalls.length, 1);
  assert.equal(harness.fetchCalls.length, 1);
  const requestUrl = new URL(harness.fetchCalls[0].url, "http://localhost");
  assert.equal(requestUrl.pathname, "/api/locations/nearby");
  assert.equal(requestUrl.searchParams.get("lat"), "51.5007");
  assert.equal(requestUrl.searchParams.get("lng"), "-0.1246");
});

test("web app keeps current location centered after nearby results load", async () => {
  const googleMapsStub = createGoogleMapsStub();
  const harness = createHarness({
    google: googleMapsStub.google,
    bootstrapOverrides: {
      googleMapsApiKey: "test-key"
    },
    navigatorOverride: {
      geolocation: {
        getCurrentPosition(success) {
          success({
            coords: {
              latitude: 51.5007,
              longitude: -0.1246
            }
          });
        }
      }
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get() {
          return null;
        }
      },
      async json() {
        return {
          locations: [
            {
              id: 1,
              name: "Westminster Cafe",
              category: "cafe",
              lat: 51.5033,
              lng: -0.1195,
              distance_m: 420
            }
          ]
        };
      }
    })
  });

  harness.elements["use-location"].dispatch("click");
  await flushImmediate();
  await flushImmediate();

  assert.equal(googleMapsStub.createdMaps.length, 1);
  assert.equal(googleMapsStub.createdMaps[0].center.lat, 51.5007);
  assert.equal(googleMapsStub.createdMaps[0].center.lng, -0.1246);
});

test("web app restores deep-linked search filters into controls and the initial API request", async () => {
  const harness = createHarness({
    search: "?q=camden&category=cafe&radius=5000&verified=true&lat=51.5072&lng=-0.1276&label=Central%20London"
  });

  assert.equal(harness.elements["search-input"].value, "camden");
  assert.equal(harness.elements["category-input"].value, "cafe");
  assert.equal(harness.elements["radius-select"].value, "5000");
  assert.equal(harness.elements["verified-only"].checked, true);
  assert.match(harness.elements["add-location-location-summary"].textContent, /Central London/);

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
    search: "?lat=51.5255&lng=-0.076&label=Shoreditch%20Area",
    fetchImpl: async (_url, options) => {
      requestCount += 1;
      if (requestCount === 1) {
        return {
          ok: true,
          status: 200,
          headers: {
            get() {
              return null;
            }
          },
          async json() {
            return { locations: [] };
          }
        };
      }

      if (requestCount === 2) {
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
  harness.elements["add-location-address"].value = "Old Street, London";

  harness.elements["add-location-form"].dispatch("submit");
  await flushImmediate();

  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(harness.elements["add-location-duplicate-warning"].hidden, false);
  assert.match(harness.elements["add-location-duplicate-list"].innerHTML, /Shoreditch Study Hall/);
  assert.equal(harness.storage.get("wifinder-device-token"), "device-token-1");

  harness.elements["add-location-submit-anyway"].dispatch("click");
  await flushImmediate();

  assert.equal(harness.fetchCalls.length, 3);
  const secondRequestBody = JSON.parse(harness.fetchCalls[2].options.body);
  assert.equal(secondRequestBody.ignore_duplicate_warning, true);
  assert.equal(secondRequestBody.lat, 51.5255);
  assert.equal(secondRequestBody.lng, -0.076);
  assert.equal(harness.fetchCalls[2].options.headers["x-device-token"], "device-token-1");
  assert.equal(harness.elements["add-location-duplicate-warning"].hidden, true);
  assert.match(harness.elements["add-location-feedback"].textContent, /now live/);
  assert.match(harness.elements["location-list"].innerHTML, /Shoreditch Study Hall/);
});

test("web app uses address autocomplete to move the add-location pin and submit that location", async () => {
  const googleMapsStub = createGoogleMapsStub();
  let requestCount = 0;
  const harness = createHarness({
    search: "?lat=51.5072&lng=-0.1276&label=Central%20London",
    google: googleMapsStub.google,
    bootstrapOverrides: {
      googleMapsApiKey: "test-key"
    },
    fetchImpl: async (_url, options) => {
      requestCount += 1;
      if (requestCount === 1) {
        return {
          ok: true,
          status: 200,
          headers: { get() { return null; } },
          async json() {
            return { locations: [] };
          }
        };
      }

      return {
        ok: true,
        status: 201,
        headers: { get() { return "device-token-2"; } },
        async json() {
          return {
            location: {
              id: 14,
              name: "Baker Street Lounge",
              category: "cafe",
              lat: 51.5237,
              lng: -0.1585,
              address: "221B Baker Street, London",
              wifi_confidence: 0,
              freshness_badge: "Unknown",
              last_verified_at: null
            }
          };
        }
      };
    }
  });

  await flushImmediate();
  assert.equal(googleMapsStub.createdAutocompletes.length, 1);

  googleMapsStub.createdAutocompletes[0].triggerPlace({
    formatted_address: "221B Baker Street, London",
    geometry: {
      location: {
        lat() {
          return 51.5237;
        },
        lng() {
          return -0.1585;
        }
      }
    }
  });

  harness.elements["add-location-name"].value = "Baker Street Lounge";
  harness.elements["add-location-category"].value = "cafe";
  await flushImmediate();

  assert.match(harness.elements["add-location-location-summary"].textContent, /221B Baker Street, London/);

  harness.elements["add-location-form"].dispatch("submit");
  await flushImmediate();

  assert.equal(harness.fetchCalls.length, 2);
  const createRequestBody = JSON.parse(harness.fetchCalls[1].options.body);
  assert.equal(createRequestBody.lat, 51.5237);
  assert.equal(createRequestBody.lng, -0.1585);
  assert.equal(createRequestBody.address, "221B Baker Street, London");
  assert.match(harness.elements["location-list"].innerHTML, /Baker Street Lounge/);
});

test("web app lets the user place a venue pin on the map", async () => {
  const googleMapsStub = createGoogleMapsStub();
  const harness = createHarness({
    search: "?lat=51.5072&lng=-0.1276&label=Central%20London",
    google: googleMapsStub.google,
    bootstrapOverrides: {
      googleMapsApiKey: "test-key"
    }
  });

  await flushImmediate();
  assert.equal(googleMapsStub.createdMaps.length, 1);
  assert.equal(googleMapsStub.createdMaps[0].options.clickableIcons, true);

  harness.elements["add-location-place-pin"].dispatch("click");
  googleMapsStub.createdMaps[0].trigger("click", {
    latLng: {
      lat() {
        return 51.5014;
      },
      lng() {
        return -0.1419;
      }
    }
  });
  await flushImmediate();

  assert.match(harness.elements["add-location-location-summary"].textContent, /Pinned venue address/);
  assert.equal(harness.elements["add-location-address"].value, "Pinned venue address");
  assert.equal(harness.elements["add-location-feedback"].textContent.includes("Pin placement is active"), false);
});

test("web app opens a custom add wifi popup when the user clicks the map", async () => {
  const googleMapsStub = createGoogleMapsStub();
  const harness = createHarness({
    search: "?lat=51.5072&lng=-0.1276&label=Central%20London",
    google: googleMapsStub.google,
    bootstrapOverrides: {
      googleMapsApiKey: "test-key"
    }
  });

  await flushImmediate();
  assert.equal(googleMapsStub.createdMaps.length, 1);

  googleMapsStub.createdMaps[0].trigger("click", {
    latLng: {
      lat() {
        return 51.5033;
      },
      lng() {
        return -0.1195;
      }
    }
  });
  await flushImmediate();

  assert.equal(harness.elements["map-overlay"].hidden, false);
  assert.match(harness.elements["map-overlay"].innerHTML, /Pinned venue address/);
  assert.match(harness.elements["map-overlay"].innerHTML, /Add WiFi details/);
  assert.match(harness.elements["location-list"].innerHTML, /Pinned venue address/);
  assert.match(harness.elements["location-list"].innerHTML, /Add WiFi details/);
});

test("web app intercepts Google basemap place clicks even without the add-location form", async () => {
  const googleMapsStub = createGoogleMapsStub({
    placeDetailsById: {
      "poi-home": {
        name: "Home Screen Cafe",
        formatted_address: "12 Example Street, London",
        geometry: {
          location: {
            lat() {
              return 51.5037;
            },
            lng() {
              return -0.1201;
            }
          }
        }
      }
    }
  });
  const harness = createHarness({
    search: "?lat=51.5072&lng=-0.1276&label=Central%20London",
    google: googleMapsStub.google,
    includeAddLocationUi: false,
    bootstrapOverrides: {
      googleMapsApiKey: "test-key"
    }
  });

  await flushImmediate();

  let stopped = false;
  googleMapsStub.createdMaps[0].trigger("click", {
    placeId: "poi-home",
    stop() {
      stopped = true;
    },
    latLng: {
      lat() {
        return 51.5037;
      },
      lng() {
        return -0.1201;
      }
    }
  });
  await flushImmediate();

  assert.equal(stopped, true);
  assert.equal(harness.elements["map-overlay"].hidden, false);
  assert.match(harness.elements["map-overlay"].innerHTML, /Home Screen Cafe/);
  assert.match(harness.elements["map-overlay"].innerHTML, /Add WiFi details/);
});

test("web app uses the custom overlay when clicking an existing result marker", async () => {
  const googleMapsStub = createGoogleMapsStub();
  const harness = createHarness({
    search: "?lat=51.5072&lng=-0.1276&label=Central%20London",
    google: googleMapsStub.google,
    bootstrapOverrides: {
      googleMapsApiKey: "test-key"
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: {
        get() {
          return null;
        }
      },
      async json() {
        return {
          locations: [
            {
              id: 1,
              name: "Cafe Zero",
              category: "cafe",
              lat: 51.508,
              lng: -0.128,
              distance_m: 120
            }
          ]
        };
      }
    })
  });

  await flushImmediate();

  const resultMarker = googleMapsStub.createdMarkers.find((marker) => marker.title === "Cafe Zero");
  assert.ok(resultMarker);

  resultMarker.trigger("click");
  await flushImmediate();

  assert.equal(googleMapsStub.createdInfoWindows.length, 0);
  assert.equal(harness.elements["map-overlay"].hidden, false);
  assert.match(harness.elements["map-overlay"].innerHTML, /Cafe Zero/);
  assert.match(harness.elements["map-overlay"].innerHTML, /WiFi details are already listed in the results below/);
  assert.equal(harness.elements["map-overlay"].style.bottom, "auto");
  assert.equal(harness.elements["map-overlay"].style.transform, "translate(-50%, -100%)");
  assert.match(harness.elements["map-overlay"].style.left, /px$/);
  assert.match(harness.elements["map-overlay"].style.top, /px$/);
});

test("web app attaches the custom popup to the map overlay pane, anchors to the exact map point, and redraws when the map moves", async () => {
  let overlayPoint = { x: 340, y: 210 };
  const googleMapsStub = createGoogleMapsStub({
    placeDetailsById: {
      "poi-positioned": {
        name: "Anchored Cafe",
        formatted_address: "20 Example Street, London",
        geometry: {
          location: {
            lat() {
              return 51.5033;
            },
            lng() {
              return -0.1195;
            }
          }
        }
      }
    },
    divPixelForLatLng() {
      return overlayPoint;
    }
  });
  const harness = createHarness({
    search: "?lat=51.5072&lng=-0.1276&label=Central%20London",
    google: googleMapsStub.google,
    bootstrapOverrides: {
      googleMapsApiKey: "test-key"
    }
  });

  await flushImmediate();

  googleMapsStub.createdMaps[0].trigger("click", {
    placeId: "poi-positioned",
    stop() {},
    latLng: {
      lat() {
        return 51.5033;
      },
      lng() {
        return -0.1195;
      }
    }
  });
  await flushImmediate();

  assert.equal(harness.elements["map-overlay"].hidden, false);
  assert.equal(harness.elements["map-overlay"].parentNode?.id, "map-float-pane");
  assert.equal(harness.elements["map-overlay"].style.left, "340px");
  assert.equal(harness.elements["map-overlay"].style.top, "190px");
  assert.equal(harness.elements["map-overlay"].style.right, "auto");
  assert.equal(harness.elements["map-overlay"].style.bottom, "auto");
  assert.equal(harness.elements["map-overlay"].style.transform, "translate(-50%, -100%)");

  overlayPoint = { x: 40, y: 84 };
  googleMapsStub.createdMaps[0].panTo({ lat: 51.504, lng: -0.119 });

  assert.equal(harness.elements["map-overlay"].style.left, "40px");
  assert.equal(harness.elements["map-overlay"].style.top, "64px");
});

test("web app replaces the Google place card with a custom add wifi details popup", async () => {
  const googleMapsStub = createGoogleMapsStub({
    placeDetailsById: {
      "poi-1": {
        name: "Map Click Cafe",
        formatted_address: "10 Example Street, London",
        geometry: {
          location: {
            lat() {
              return 51.5033;
            },
            lng() {
              return -0.1195;
            }
          }
        }
      }
    }
  });
  const harness = createHarness({
    search: "?lat=51.5072&lng=-0.1276&label=Central%20London",
    google: googleMapsStub.google,
    bootstrapOverrides: {
      googleMapsApiKey: "test-key"
    }
  });

  await flushImmediate();
  assert.equal(googleMapsStub.createdMaps.length, 1);

  let stopped = false;
  googleMapsStub.createdMaps[0].trigger("click", {
    placeId: "poi-1",
    stop() {
      stopped = true;
    },
    latLng: {
      lat() {
        return 51.5033;
      },
      lng() {
        return -0.1195;
      }
    }
  });
  await flushImmediate();

  assert.equal(stopped, true);
  assert.equal(harness.elements["map-overlay"].hidden, false);
  assert.match(harness.elements["map-overlay"].innerHTML, /Map Click Cafe/);
  assert.match(harness.elements["map-overlay"].innerHTML, /Add WiFi details/);
  assert.equal(harness.elements["map-overlay"].style.bottom, "auto");
  assert.equal(harness.elements["map-overlay"].style.right, "auto");
  assert.equal(harness.elements["map-overlay"].style.transform, "translate(-50%, -100%)");
  assert.match(harness.elements["map-overlay"].style.left, /px$/);
  assert.match(harness.elements["map-overlay"].style.top, /px$/);
  assert.match(harness.elements["location-list"].innerHTML, /Map Click Cafe/);
  assert.match(harness.elements["location-list"].innerHTML, /Add WiFi details/);
});

test("web app suppresses the native Google place popup before loading the custom popup", async () => {
  const googleMapsStub = createGoogleMapsStub({
    placeDetailsById: {
      "poi-2": {
        name: "No LatLng Cafe",
        formatted_address: "11 Example Street, London",
        geometry: {
          location: {
            lat() {
              return 51.504;
            },
            lng() {
              return -0.118;
            }
          }
        }
      }
    }
  });
  const harness = createHarness({
    search: "?lat=51.5072&lng=-0.1276&label=Central%20London",
    google: googleMapsStub.google,
    bootstrapOverrides: {
      googleMapsApiKey: "test-key"
    }
  });

  await flushImmediate();

  let stopped = false;
  googleMapsStub.createdMaps[0].trigger("click", {
    placeId: "poi-2",
    stop() {
      stopped = true;
    }
  });
  await flushImmediate();

  assert.equal(stopped, true);
  assert.equal(harness.elements["map-overlay"].hidden, false);
  assert.match(harness.elements["map-overlay"].innerHTML, /No LatLng Cafe/);
  assert.match(harness.elements["map-overlay"].innerHTML, /Add WiFi details/);
});

test("web app recreates the Google Map when toggling dark mode", async () => {
  const googleMapsStub = createGoogleMapsStub();
  const harness = createHarness({
    search: "?lat=51.5072&lng=-0.1276&label=Central%20London",
    google: googleMapsStub.google,
    bootstrapOverrides: {
      googleMapsApiKey: "test-key",
      googleMapsMapId: "LIGHT_MAP_ID"
    }
  });

  await flushImmediate();

  assert.equal(googleMapsStub.createdMaps.length, 1);
  assert.equal(googleMapsStub.createdMaps[0].options.mapId, "LIGHT_MAP_ID");
  assert.equal(googleMapsStub.createdMaps[0].options.colorScheme, "LIGHT");
  assert.equal(harness.storage.get("wifinder-theme"), undefined);

  harness.elements["theme-toggle"].dispatch("click");
  await flushImmediate();

  assert.equal(googleMapsStub.createdMaps.length, 2);
  assert.equal(googleMapsStub.createdMaps[1].options.mapId, "LIGHT_MAP_ID");
  assert.equal(googleMapsStub.createdMaps[1].options.colorScheme, "DARK");
  assert.equal(googleMapsStub.createdMaps[1].options.styles, null);
  assert.equal(harness.storage.get("wifinder-theme"), "dark");
});

test("web app skips mapId and advanced markers when no real Google Maps map ID is configured", async () => {
  const googleMapsStub = createGoogleMapsStub();
  const harness = createHarness({
    search: "?lat=51.5072&lng=-0.1276&label=Central%20London",
    google: googleMapsStub.google,
    bootstrapOverrides: {
      googleMapsApiKey: "test-key",
      googleMapsMapId: "DEMO_MAP_ID"
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get() { return null; } },
      async json() {
        return {
          locations: [
            {
              id: 1,
              name: "Cafe Zero",
              category: "cafe",
              lat: 51.508,
              lng: -0.128,
              distance_m: 120
            }
          ]
        };
      }
    })
  });

  await flushImmediate();

  assert.equal(googleMapsStub.createdMaps.length, 1);
  assert.equal(googleMapsStub.createdMaps[0].options.mapId, null);
  assert.equal(googleMapsStub.createdMaps[0].options.colorScheme, "LIGHT");
  assert.equal(googleMapsStub.createdMaps[0].options.styles, null);
  assert.equal(harness.elements["location-list"].innerHTML.includes("Cafe Zero"), true);
});
