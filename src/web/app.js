(function () {
  const bootstrapElement = document.getElementById("app-bootstrap");
  if (!bootstrapElement) {
    return;
  }

  const config = JSON.parse(bootstrapElement.textContent);
  const SEARCH_DEBOUNCE_MS = 300;
  const elements = {
    useLocation: document.getElementById("use-location"),
    useFallback: document.getElementById("use-fallback"),
    manualForm: document.getElementById("manual-location-form"),
    manualLat: document.getElementById("manual-lat"),
    manualLng: document.getElementById("manual-lng"),
    searchInput: document.getElementById("search-input"),
    statusBanner: document.getElementById("status-banner"),
    resultsSummary: document.getElementById("results-summary"),
    list: document.getElementById("location-list"),
    mapCanvas: document.getElementById("map-canvas"),
    mapOverlay: document.getElementById("map-overlay"),
    tabButtons: Array.from(document.querySelectorAll("[data-tab]")),
    panels: {
      list: document.getElementById("panel-list"),
      map: document.getElementById("panel-map")
    }
  };

  const state = {
    activeTab: "list",
    loading: false,
    permissionState: "idle",
    center: null,
    centerLabel: null,
    query: "",
    locations: [],
    error: null,
    requestSequence: 0
  };

  let mapPromise = null;
  let map = null;
  let userMarker = null;
  let markers = [];
  let infoWindow = null;
  let searchTimerId = null;

  function formatDistance(distanceMeters) {
    if (typeof distanceMeters !== "number") {
      return "Distance unavailable";
    }

    if (distanceMeters < 1000) {
      return `${distanceMeters} m away`;
    }

    return `${(distanceMeters / 1000).toFixed(1)} km away`;
  }

  function formatLastVerified(value) {
    if (!value) {
      return "No recent success vote yet";
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(new Date(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function getActiveQuery() {
    return state.query.trim();
  }

  function hasActiveSearch() {
    return getActiveQuery().length > 0;
  }

  function clearScheduledSearch() {
    if (searchTimerId !== null) {
      clearTimeout(searchTimerId);
      searchTimerId = null;
    }
  }

  function setActiveTab(tabName) {
    state.activeTab = tabName;

    for (const button of elements.tabButtons) {
      const isActive = button.dataset.tab === tabName;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    }

    for (const [name, panel] of Object.entries(elements.panels)) {
      const isActive = name === tabName;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    }

    if (tabName === "map") {
      syncMap();
    }
  }

  function renderStatus() {
    const activeQuery = getActiveQuery();
    const searchActive = activeQuery.length > 0;

    if (state.loading) {
      elements.statusBanner.textContent = searchActive
        ? `Searching for "${activeQuery}"...`
        : "Loading nearby venues...";
      return;
    }

    if (state.error) {
      elements.statusBanner.textContent = state.error;
      return;
    }

    if (!state.center && !searchActive) {
      elements.statusBanner.textContent = "Choose a location to load nearby venues.";
      return;
    }

    if (state.locations.length === 0) {
      elements.statusBanner.textContent = searchActive
        ? state.centerLabel
          ? `No venues matched "${activeQuery}" around ${state.centerLabel}.`
          : `No venues matched "${activeQuery}".`
        : `No venues found within ${config.defaultRadius / 1000} km of ${state.centerLabel}.`;
      return;
    }

    elements.statusBanner.textContent = searchActive
      ? state.centerLabel
        ? `Showing ${state.locations.length} search result${state.locations.length === 1 ? "" : "s"} around ${state.centerLabel}.`
        : `Showing ${state.locations.length} search result${state.locations.length === 1 ? "" : "s"}.`
      : `Showing ${state.locations.length} nearby venue${state.locations.length === 1 ? "" : "s"} around ${state.centerLabel}.`;
  }

  function renderList() {
    const activeQuery = getActiveQuery();
    const searchActive = activeQuery.length > 0;

    if (!state.center && !searchActive && !state.loading) {
      elements.resultsSummary.textContent = "No search run yet.";
      elements.list.innerHTML = `<article class="empty-state">Use your location, Central London, or manual coordinates to start nearby discovery.</article>`;
      return;
    }

    if (state.loading) {
      elements.resultsSummary.textContent = searchActive
        ? `Searching for "${activeQuery}"...`
        : "Searching nearby venues...";
      elements.list.innerHTML = searchActive
        ? `<article class="empty-state">Checking matching venues from the API.</article>`
        : `<article class="empty-state">Fetching the latest nearby results from the API.</article>`;
      return;
    }

    if (state.locations.length === 0) {
      elements.resultsSummary.textContent = searchActive ? "No search results found." : "No nearby venues found.";
      elements.list.innerHTML = searchActive
        ? `<article class="empty-state">Try another place name, street, postcode, or area.</article>`
        : `<article class="empty-state">Try another area or widen the search in a future increment.</article>`;
      return;
    }

    elements.resultsSummary.textContent = searchActive
      ? state.centerLabel
        ? `${state.locations.length} search result${state.locations.length === 1 ? "" : "s"} around ${state.centerLabel}.`
        : `${state.locations.length} search result${state.locations.length === 1 ? "" : "s"}.`
      : `${state.locations.length} venue${state.locations.length === 1 ? "" : "s"} within ${config.defaultRadius / 1000} km.`;
    elements.list.innerHTML = state.locations
      .map(
        (location) => `<article class="location-card">
          <div>
            <h3>${escapeHtml(location.name)}</h3>
          </div>
          <div class="location-chip-row">
            <span class="chip">${escapeHtml(location.category)}</span>
            <span class="chip chip-confidence">${location.wifi_confidence}% confidence</span>
            <span class="chip chip-freshness">${escapeHtml(location.freshness_badge)}</span>
          </div>
          <div class="location-meta">
            <div>${escapeHtml(formatDistance(location.distance_m))}</div>
            <div>Last verified: ${escapeHtml(formatLastVerified(location.last_verified_at))}</div>
            <div>${escapeHtml(location.address || "No address submitted yet")}</div>
          </div>
        </article>`
      )
      .join("");
  }

  function renderMapMessage(message) {
    elements.mapOverlay.hidden = false;
    elements.mapOverlay.textContent = message;
  }

  function clearMapMarkers() {
    for (const marker of markers) {
      marker.setMap(null);
    }
    markers = [];
  }

  function createMarker(position, title, iconUrl) {
    return new google.maps.Marker({
      map,
      position,
      title,
      icon: iconUrl
    });
  }

  function updateMapMarkers() {
    if (!map) {
      return;
    }

    clearMapMarkers();

    if (userMarker) {
      userMarker.setMap(null);
      userMarker = null;
    }

    if (state.center) {
      userMarker = createMarker(state.center, "You are here", "https://maps.google.com/mapfiles/ms/icons/blue-dot.png");
    }

    for (const location of state.locations) {
      const marker = createMarker(
        { lat: location.lat, lng: location.lng },
        location.name,
        "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
      );
      marker.addListener("click", () => {
        infoWindow =
          infoWindow ??
          new google.maps.InfoWindow({
            maxWidth: 260
          });
        infoWindow.setContent(
          `<strong>${escapeHtml(location.name)}</strong><br>${escapeHtml(location.category)}<br>${escapeHtml(formatDistance(location.distance_m))}`
        );
        infoWindow.open({ anchor: marker, map });
      });
      markers.push(marker);
    }
  }

  function fitMapBounds() {
    if (!map) {
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;

    if (state.center) {
      bounds.extend(state.center);
      hasPoint = true;
    }

    for (const location of state.locations) {
      bounds.extend({ lat: location.lat, lng: location.lng });
      hasPoint = true;
    }

    if (!hasPoint) {
      map.setCenter(config.fallbackCenter);
      map.setZoom(13);
      return;
    }

    if (state.locations.length === 0 && state.center) {
      map.setCenter(state.center);
      map.setZoom(14);
      return;
    }

    map.fitBounds(bounds, 72);
  }

  function loadGoogleMaps() {
    if (!config.googleMapsApiKey) {
      return Promise.reject(new Error("Google Maps API key is not configured."));
    }

    if (window.google && window.google.maps) {
      return Promise.resolve(window.google.maps);
    }

    if (mapPromise) {
      return mapPromise;
    }

    mapPromise = new Promise((resolve, reject) => {
      const callbackName = "__wifinderGoogleMapsReady";
      window[callbackName] = function () {
        resolve(window.google.maps);
        delete window[callbackName];
      };

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsApiKey)}&callback=${callbackName}`;
      script.async = true;
      script.onerror = () => {
        reject(new Error("Google Maps failed to load."));
        delete window[callbackName];
      };
      document.head.appendChild(script);
    });

    return mapPromise;
  }

  function syncMap() {
    if (state.activeTab !== "map") {
      return;
    }

    if (!config.googleMapsApiKey) {
      renderMapMessage("Set GOOGLE_MAPS_API_KEY to enable the live Google Map. List view remains fully functional.");
      return;
    }

    loadGoogleMaps()
      .then(() => {
        if (!map) {
          map = new google.maps.Map(elements.mapCanvas, {
            center: state.center || config.fallbackCenter,
            zoom: 13,
            disableDefaultUI: true,
            zoomControl: true,
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false
          });
        }

        updateMapMarkers();
        fitMapBounds();

        if (state.locations.length === 0 && !state.center) {
          renderMapMessage(
            hasActiveSearch()
              ? "No venue pins matched this search yet."
              : "Use your location or the fallback center to place nearby venue pins."
          );
        } else if (state.locations.length === 0) {
          renderMapMessage(hasActiveSearch() ? "No search result pins yet for this area." : "No nearby venue pins yet for this area.");
        } else {
          elements.mapOverlay.hidden = true;
        }
      })
      .catch((error) => {
        renderMapMessage(error.message);
      });
  }

  async function fetchLocations({ center = state.center, label = state.centerLabel, query = state.query } = {}) {
    const normalizedQuery = String(query ?? "").trim();

    if (!center && normalizedQuery.length === 0) {
      state.center = null;
      state.centerLabel = null;
      state.query = "";
      state.locations = [];
      state.error = null;
      state.loading = false;
      renderStatus();
      renderList();
      syncMap();
      return;
    }

    const requestId = state.requestSequence + 1;
    state.requestSequence = requestId;
    state.loading = true;
    state.error = null;
    state.center = center;
    state.centerLabel = label;
    state.query = normalizedQuery;
    renderStatus();
    renderList();
    syncMap();

    try {
      const params = new URLSearchParams();
      if (normalizedQuery) {
        params.set("q", normalizedQuery);
      }
      if (center) {
        params.set("lat", String(center.lat));
        params.set("lng", String(center.lng));
        params.set("radius", String(config.defaultRadius));
      }

      const endpoint = normalizedQuery ? config.searchEndpoint : config.nearbyEndpoint;
      const response = await fetch(`${endpoint}?${params.toString()}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message || "Nearby lookup failed.");
      }

      if (requestId !== state.requestSequence) {
        return;
      }

      state.locations = Array.isArray(payload.locations) ? payload.locations : [];
    } catch (error) {
      if (requestId !== state.requestSequence) {
        return;
      }

      state.locations = [];
      state.error = error.message;
    } finally {
      if (requestId !== state.requestSequence) {
        return;
      }

      state.loading = false;
      renderStatus();
      renderList();
      syncMap();
    }
  }

  function fetchNearby(center, label) {
    clearScheduledSearch();
    return fetchLocations({ center, label });
  }

  function scheduleSearch() {
    clearScheduledSearch();
    state.query = elements.searchInput.value;

    if (!state.center && !hasActiveSearch()) {
      renderStatus();
      renderList();
      syncMap();
      return;
    }

    searchTimerId = setTimeout(() => {
      searchTimerId = null;
      fetchLocations({
        center: state.center,
        label: state.centerLabel,
        query: elements.searchInput.value
      });
    }, SEARCH_DEBOUNCE_MS);
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      state.permissionState = "unavailable";
      state.error = "Geolocation is not available in this browser. Try the fallback center or manual coordinates.";
      renderStatus();
      return;
    }

    state.loading = true;
    state.error = null;
    renderStatus();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.permissionState = "granted";
        fetchNearby(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          },
          "your current location"
        );
      },
      (error) => {
        state.loading = false;
        state.permissionState = error.code === 1 ? "denied" : "error";
        state.error =
          error.code === 1
            ? "Location permission was denied. Use the fallback center or manual coordinates instead."
            : "Your location could not be determined. Try again or use the fallback center.";
        renderStatus();
        renderList();
        syncMap();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }

  function submitManualLocation(event) {
    event.preventDefault();

    const lat = Number(elements.manualLat.value);
    const lng = Number(elements.manualLng.value);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      state.error = "Enter numeric latitude and longitude values.";
      renderStatus();
      return;
    }

    fetchNearby({ lat, lng }, "your chosen coordinates");
  }

  elements.useLocation.addEventListener("click", requestCurrentLocation);
  elements.useFallback.addEventListener("click", () =>
    fetchNearby(
      {
        lat: config.fallbackCenter.lat,
        lng: config.fallbackCenter.lng
      },
      config.fallbackCenter.label
    )
  );
  elements.manualForm.addEventListener("submit", submitManualLocation);
  elements.searchInput.addEventListener("input", scheduleSearch);
  for (const button of elements.tabButtons) {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  }

  renderStatus();
  renderList();
})();
