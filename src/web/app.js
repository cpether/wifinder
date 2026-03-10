(function () {
  const bootstrapElement = document.getElementById("app-bootstrap");
  if (!bootstrapElement) {
    return;
  }

  const config = JSON.parse(bootstrapElement.textContent);
  const radiusOptions = Array.isArray(config.radiusOptions) && config.radiusOptions.length > 0
    ? config.radiusOptions
    : [config.defaultRadius];

  function normalizeRadius(value) {
    const parsed = Number(value);
    if (radiusOptions.includes(parsed)) {
      return parsed;
    }
    return config.defaultRadius;
  }

  function readInitialState() {
    const params = new URLSearchParams(window.location.search);
    const hasLat = params.has("lat");
    const hasLng = params.has("lng");
    const lat = hasLat ? Number(params.get("lat")) : NaN;
    const lng = hasLng ? Number(params.get("lng")) : NaN;
    const hasCenter = hasLat && hasLng && Number.isFinite(lat) && Number.isFinite(lng);

    return {
      center: hasCenter ? { lat, lng } : null,
      centerLabel: hasCenter ? params.get("label") || "saved search area" : null,
      centerSource: hasCenter ? "deeplink" : null,
      searchQuery: params.get("q") || "",
      category: params.get("category") || "",
      radius: normalizeRadius(params.get("radius")),
      verifiedOnly: params.get("verified") === "true"
    };
  }

  const elements = {
    useLocation: document.getElementById("use-location"),
    useFallback: document.getElementById("use-fallback"),
    searchInput: document.getElementById("search-input"),
    categoryInput: document.getElementById("category-input"),
    radiusSelect: document.getElementById("radius-select"),
    verifiedOnly: document.getElementById("verified-only"),
    addLocationForm: document.getElementById("add-location-form"),
    addLocationName: document.getElementById("add-location-name"),
    addLocationCategory: document.getElementById("add-location-category"),
    addLocationLocationSummary: document.getElementById("add-location-location-summary"),
    addLocationAddress: document.getElementById("add-location-address"),
    addLocationNotes: document.getElementById("add-location-notes"),
    addLocationFeedback: document.getElementById("add-location-feedback"),
    addLocationDuplicateWarning: document.getElementById("add-location-duplicate-warning"),
    addLocationDuplicateSummary: document.getElementById("add-location-duplicate-summary"),
    addLocationDuplicateList: document.getElementById("add-location-duplicate-list"),
    addLocationSubmit: document.getElementById("add-location-submit"),
    addLocationSubmitAnyway: document.getElementById("add-location-submit-anyway"),
    addLocationCancelWarning: document.getElementById("add-location-cancel-warning"),
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

  /* ═══════ Theme Toggle ═══════ */
  const themeToggle = document.getElementById("theme-toggle");
  const sunIcon = document.getElementById("theme-icon-sun");
  const moonIcon = document.getElementById("theme-icon-moon");

  function getStoredTheme() {
    try {
      return window.localStorage && window.localStorage.getItem("wifinder-theme");
    } catch {
      return null;
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (sunIcon && moonIcon) {
      sunIcon.style.display = theme === "dark" ? "" : "none";
      moonIcon.style.display = theme === "dark" ? "none" : "";
    }
    try {
      if (window.localStorage) {
        window.localStorage.setItem("wifinder-theme", theme);
      }
    } catch {
      /* storage unavailable */
    }
  }

  const storedTheme = getStoredTheme();
  if (storedTheme === "dark" || storedTheme === "light") {
    applyTheme(storedTheme);
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  /* ═══════ App State ═══════ */
  const initialState = readInitialState();
  const DEVICE_TOKEN_STORAGE_KEY = "wifinder-device-token";
  const state = {
    activeTab: "list",
    loading: false,
    permissionState: "idle",
    center: initialState.center,
    centerLabel: initialState.centerLabel,
    centerSource: initialState.centerSource,
    locations: [],
    error: null,
    searchQuery: initialState.searchQuery,
    filters: {
      category: initialState.category,
      radius: initialState.radius,
      verifiedOnly: initialState.verifiedOnly
    },
    addLocation: {
      submitting: false,
      error: null,
      success: null,
      duplicates: [],
      pendingPayload: null
    }
  };

  let mapPromise = null;
  let map = null;
  let userMarker = null;
  let markers = [];
  let infoWindow = null;
  let searchTimer = null;
  let requestSequence = 0;
  let deviceToken = getStoredDeviceToken();

  function normalizeSearchQuery() {
    return state.searchQuery.trim();
  }

  function normalizeCategory() {
    return state.filters.category.trim();
  }

  function hasTypedSearch() {
    return normalizeSearchQuery().length > 0 || normalizeCategory().length > 0;
  }

  function hasSearchCriteria() {
    return hasTypedSearch() || state.filters.verifiedOnly;
  }

  function formatDistance(distanceMeters) {
    if (typeof distanceMeters !== "number") {
      return "Distance unavailable";
    }

    if (distanceMeters < 1000) {
      return `${distanceMeters} m away`;
    }

    return `${(distanceMeters / 1000).toFixed(1)} km away`;
  }

  function formatRadius(radiusMeters) {
    if (radiusMeters < 1000) {
      return `${radiusMeters} m`;
    }

    const radiusKm = radiusMeters / 1000;
    return Number.isInteger(radiusKm) ? `${radiusKm} km` : `${radiusKm.toFixed(1)} km`;
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

  function confidenceColor(confidence) {
    if (confidence >= 70) return "var(--success, #22c55e)";
    if (confidence >= 40) return "var(--warning, #eab308)";
    return "var(--danger, #ef4444)";
  }

  function confidenceBars(confidence) {
    const level = confidence >= 70 ? 3 : confidence >= 40 ? 2 : 1;
    const color = confidenceColor(confidence);
    const dim = "var(--border, rgba(59,130,246,0.12))";
    return [1, 2, 3]
      .map(
        (i) =>
          `<span style="display:inline-block;width:4px;border-radius:2px;height:${6 + i * 4}px;background:${i <= level ? color : dim};transition:background 0.3s"></span>`
      )
      .join("");
  }

  function applyStateToControls() {
    elements.searchInput.value = state.searchQuery;
    elements.categoryInput.value = state.filters.category;
    elements.radiusSelect.value = String(state.filters.radius);
    elements.verifiedOnly.checked = state.filters.verifiedOnly;
  }

  function getStoredDeviceToken() {
    try {
      return window.localStorage ? window.localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) : null;
    } catch {
      return null;
    }
  }

  function storeDeviceToken(token) {
    if (!token) {
      return;
    }

    deviceToken = token;
    try {
      if (window.localStorage) {
        window.localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, token);
      }
    } catch {
      /* storage unavailable */
    }
  }

  async function apiJsonRequest(url, options = {}) {
    const headers = { ...(options.headers ?? {}) };
    if (deviceToken) {
      headers["x-device-token"] = deviceToken;
    }
    if (options.body !== undefined && !("content-type" in headers) && !("Content-Type" in headers)) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const nextToken = response.headers && typeof response.headers.get === "function"
      ? response.headers.get("x-device-token")
      : null;
    if (nextToken) {
      storeDeviceToken(nextToken);
    }

    const payload = await response.json();
    return { response, payload };
  }

  function syncUrl() {
    if (!window.history || typeof window.history.replaceState !== "function") {
      return;
    }

    const params = new URLSearchParams();
    const searchQuery = normalizeSearchQuery();
    const category = normalizeCategory();

    if (searchQuery) {
      params.set("q", searchQuery);
    }

    if (category) {
      params.set("category", category);
    }

    if (state.filters.radius !== config.defaultRadius) {
      params.set("radius", String(state.filters.radius));
    }

    if (state.filters.verifiedOnly) {
      params.set("verified", "true");
    }

    if (state.center && state.centerSource !== "geolocation") {
      params.set("lat", String(state.center.lat));
      params.set("lng", String(state.center.lng));
      if (state.centerLabel) {
        params.set("label", state.centerLabel);
      }
    }

    const nextSearch = params.toString();
    const nextUrl = nextSearch ? `${window.location.pathname}?${nextSearch}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
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
    const searchQuery = normalizeSearchQuery();
    const mode = getRequestMode();

    if (state.loading) {
      if (mode === "search") {
        elements.statusBanner.textContent = searchQuery
          ? `Searching for "${searchQuery}"${state.centerLabel ? ` near ${state.centerLabel}` : ""}...`
          : "Applying the current search filters...";
      } else {
        elements.statusBanner.textContent = "Loading nearby venues...";
      }
      return;
    }

    if (state.error) {
      elements.statusBanner.textContent = state.error;
      return;
    }

    if (mode === "search") {
      if (state.locations.length === 0) {
        elements.statusBanner.textContent = searchQuery
          ? `No venues matched "${searchQuery}"${state.centerLabel ? ` near ${state.centerLabel}` : ""}.`
          : "No venues matched the current filters.";
        return;
      }

      elements.statusBanner.textContent = searchQuery
        ? `Showing ${state.locations.length} result${state.locations.length === 1 ? "" : "s"} for "${searchQuery}"${state.centerLabel ? ` near ${state.centerLabel}` : ""}.`
        : `Showing ${state.locations.length} filtered venue${state.locations.length === 1 ? "" : "s"}.`;
      return;
    }

    if (!state.center) {
      elements.statusBanner.textContent = "Choose a location to load nearby venues, or start typing to search the full dataset.";
      return;
    }

    if (state.locations.length === 0) {
      elements.statusBanner.textContent = `No venues found within ${formatRadius(state.filters.radius)} of ${state.centerLabel}.`;
      return;
    }

    elements.statusBanner.textContent = `Showing ${state.locations.length} nearby venue${state.locations.length === 1 ? "" : "s"} around ${state.centerLabel}.`;
  }

  function renderList() {
    const searchQuery = normalizeSearchQuery();
    const mode = getRequestMode();

    if (!state.center && !hasSearchCriteria() && !state.loading) {
      elements.resultsSummary.textContent = "No search run yet.";
      elements.list.innerHTML =
        '<article class="empty-state">Use your location, Central London, or the search bar to start discovery.</article>';
      return;
    }

    if (state.loading) {
      elements.resultsSummary.textContent = mode === "search" ? "Searching venues..." : "Searching nearby venues...";
      elements.list.innerHTML =
        '<article class="empty-state">Fetching the latest venue results from the API.</article>';
      return;
    }

    if (state.locations.length === 0) {
      elements.resultsSummary.textContent = mode === "search" ? "No search results found." : "No nearby venues found.";
      elements.list.innerHTML = mode === "search"
        ? `<article class="empty-state">${searchQuery ? `Try a broader search for "${escapeHtml(searchQuery)}".` : "Try relaxing a filter or widening the radius."}</article>`
        : '<article class="empty-state">Try another area or widen the search radius.</article>';
      return;
    }

    elements.resultsSummary.textContent = mode === "search"
      ? searchQuery
        ? `${state.locations.length} result${state.locations.length === 1 ? "" : "s"} for "${searchQuery}".`
        : `${state.locations.length} filtered venue${state.locations.length === 1 ? "" : "s"}.`
      : `${state.locations.length} venue${state.locations.length === 1 ? "" : "s"} within ${formatRadius(state.filters.radius)}.`;

    elements.list.innerHTML = state.locations
      .map(
        (location) => `<article class="location-card">
          <div style="display:flex;align-items:start;justify-content:space-between;gap:0.5rem">
            <div style="min-width:0">
              <h3>${escapeHtml(location.name)}</h3>
            </div>
            <div style="display:flex;align-items:end;gap:3px;flex-shrink:0">${confidenceBars(location.wifi_confidence)}</div>
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
    const searchQuery = normalizeSearchQuery();
    const mode = getRequestMode();

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

        if (state.locations.length === 0 && !state.center && !hasSearchCriteria()) {
          renderMapMessage("Use your location, the fallback center, or the search bar to place venue pins.");
        } else if (state.locations.length === 0) {
          renderMapMessage(
            mode === "search" && searchQuery
              ? `No map pins matched "${searchQuery}".`
              : "No venue pins matched the current filters."
          );
        } else {
          elements.mapOverlay.hidden = true;
        }
      })
      .catch((error) => {
        renderMapMessage(error.message);
      });
  }

  function getRequestMode() {
    return hasSearchCriteria() ? "search" : "nearby";
  }

  function getAddLocationCenter() {
    return state.center;
  }

  function resetAddLocationFeedback() {
    state.addLocation.error = null;
    state.addLocation.success = null;
  }

  function clearDuplicateWarning() {
    state.addLocation.duplicates = [];
    state.addLocation.pendingPayload = null;
  }

  function renderAddLocation() {
    const addLocationCenter = getAddLocationCenter();
    const feedback = state.addLocation.submitting
      ? "Checking for duplicates and saving your venue..."
      : state.addLocation.error ??
        state.addLocation.success ??
        "Choose a discovery area first, then add the venue details.";
    const feedbackState = state.addLocation.submitting
      ? "pending"
      : state.addLocation.error
        ? "error"
        : state.addLocation.success
          ? "success"
          : "idle";

    elements.addLocationFeedback.textContent = feedback;
    elements.addLocationFeedback.setAttribute("data-state", feedbackState);
    elements.addLocationLocationSummary.textContent = addLocationCenter
      ? `Venue location will use ${state.centerLabel || "your selected area"}.`
      : "Pick your location or Central London above before submitting a new venue.";
    elements.addLocationLocationSummary.setAttribute("data-state", addLocationCenter ? "success" : "idle");
    elements.addLocationSubmit.disabled = state.addLocation.submitting;
    elements.addLocationSubmitAnyway.disabled =
      state.addLocation.submitting || !state.addLocation.pendingPayload;
    elements.addLocationCancelWarning.disabled = state.addLocation.submitting;

    const duplicateCount = state.addLocation.duplicates.length;
    elements.addLocationDuplicateWarning.hidden = duplicateCount === 0;
    if (duplicateCount === 0) {
      elements.addLocationDuplicateSummary.textContent = "";
      elements.addLocationDuplicateList.innerHTML = "";
      return;
    }

    elements.addLocationDuplicateSummary.textContent =
      duplicateCount === 1
        ? "This venue looks close to an existing listing."
        : "These venues look close to your new listing.";
    elements.addLocationDuplicateList.innerHTML = state.addLocation.duplicates
      .map(
        (location) => `<article class="duplicate-card">
          <strong>${escapeHtml(location.name)}</strong>
          <div>${escapeHtml(location.category)} · ${escapeHtml(formatDistance(location.distance_m))}</div>
          <div>${escapeHtml(location.address || "No address submitted yet")}</div>
        </article>`
      )
      .join("");
  }

  function buildAddLocationPayload({ ignoreDuplicateWarning = false } = {}) {
    const addLocationCenter = getAddLocationCenter();
    const name = elements.addLocationName.value.trim();
    const category = elements.addLocationCategory.value.trim();
    const address = elements.addLocationAddress.value.trim();
    const notes = elements.addLocationNotes.value.trim();

    if (!name) {
      throw new Error("Enter a venue name before submitting.");
    }

    if (!category) {
      throw new Error("Enter a category before submitting.");
    }

    if (!addLocationCenter) {
      throw new Error("Choose your location or Central London first so we can place the venue.");
    }

    const payload = {
      name,
      category,
      lat: addLocationCenter.lat,
      lng: addLocationCenter.lng
    };

    if (address) {
      payload.address = address;
    }

    if (notes) {
      payload.notes = notes;
    }

    if (ignoreDuplicateWarning) {
      payload.ignore_duplicate_warning = true;
    }

    return payload;
  }

  function handleSuccessfulLocationCreate(location) {
    state.loading = false;
    state.error = null;
    state.searchQuery = "";
    state.filters.category = "";
    state.filters.verifiedOnly = false;
    state.center = { lat: location.lat, lng: location.lng };
    state.centerLabel = location.name;
    state.centerSource = "created-location";
    state.locations = [{ ...location, distance_m: 0 }];
    state.addLocation.success = `${location.name} is now live and visible below.`;
    clearDuplicateWarning();
    elements.addLocationName.value = "";
    elements.addLocationCategory.value = "";
    elements.addLocationAddress.value = "";
    elements.addLocationNotes.value = "";
    applyStateToControls();
    syncUrl();
    renderStatus();
    renderList();
    syncMap();
  }

  async function submitAddLocation({ ignoreDuplicateWarning = false } = {}) {
    if (state.addLocation.submitting) {
      return;
    }

    try {
      const payload = ignoreDuplicateWarning && state.addLocation.pendingPayload
        ? { ...state.addLocation.pendingPayload, ignore_duplicate_warning: true }
        : buildAddLocationPayload({ ignoreDuplicateWarning });

      state.addLocation.submitting = true;
      resetAddLocationFeedback();
      if (!ignoreDuplicateWarning) {
        clearDuplicateWarning();
      }
      renderAddLocation();

      const { response, payload: responsePayload } = await apiJsonRequest(config.createLocationEndpoint, {
        method: "POST",
        body: payload
      });

      if (response.status === 409 && Array.isArray(responsePayload.error?.details?.duplicates)) {
        state.addLocation.pendingPayload = buildAddLocationPayload();
        state.addLocation.duplicates = responsePayload.error.details.duplicates;
        renderAddLocation();
        return;
      }

      if (!response.ok) {
        throw new Error(responsePayload.error?.message || "Venue submission failed.");
      }

      handleSuccessfulLocationCreate(responsePayload.location);
    } catch (error) {
      state.addLocation.error = error.message;
    } finally {
      state.addLocation.submitting = false;
      renderAddLocation();
    }
  }

  async function fetchLocations(
    center = state.center,
    label = state.centerLabel,
    centerSource = state.centerSource
  ) {
    const searchQuery = normalizeSearchQuery();
    const category = normalizeCategory();
    const mode = getRequestMode();

    if (mode === "nearby" && !center) {
      state.loading = false;
      state.error = null;
      state.locations = [];
      syncUrl();
      renderStatus();
      renderList();
      syncMap();
      return;
    }

    const requestId = ++requestSequence;
    state.loading = true;
    state.error = null;
    state.center = center;
    state.centerLabel = label;
    state.centerSource = centerSource;
    syncUrl();
    renderStatus();
    renderList();
    syncMap();

    try {
      const params = new URLSearchParams();
      const endpoint = mode === "search" ? config.searchEndpoint : config.nearbyEndpoint;

      if (mode === "search" && searchQuery) {
        params.set("q", searchQuery);
      }

      if (category) {
        params.set("category", category);
      }

      if (center) {
        params.set("lat", String(center.lat));
        params.set("lng", String(center.lng));
        params.set("radius", String(state.filters.radius));
      }

      if (mode === "search" && state.filters.verifiedOnly) {
        params.set("verified", "true");
      }

      const { response, payload } = await apiJsonRequest(`${endpoint}?${params.toString()}`);

      if (requestId !== requestSequence) {
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error?.message || "Venue lookup failed.");
      }

      state.locations = Array.isArray(payload.locations) ? payload.locations : [];
    } catch (error) {
      if (requestId !== requestSequence) {
        return;
      }

      state.locations = [];
      state.error = error.message;
    } finally {
      if (requestId !== requestSequence) {
        return;
      }

      state.loading = false;
      renderStatus();
      renderList();
      syncMap();
    }
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      state.permissionState = "unavailable";
      state.error = "Geolocation is not available in this browser. Try the fallback center instead.";
      renderStatus();
      return;
    }

    state.loading = true;
    state.error = null;
    renderStatus();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.permissionState = "granted";
        fetchLocations(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          },
          "your current location",
          "geolocation"
        );
      },
      (error) => {
        state.loading = false;
        state.permissionState = error.code === 1 ? "denied" : "error";
        state.error =
          error.code === 1
            ? "Location permission was denied. Use the fallback center instead."
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

  function clearSearchTimer() {
    if (!searchTimer) {
      return;
    }

    window.clearTimeout(searchTimer);
    searchTimer = null;
  }

  function syncFiltersFromControls() {
    state.searchQuery = elements.searchInput.value;
    state.filters.category = elements.categoryInput.value;
    state.filters.radius = normalizeRadius(elements.radiusSelect.value);
    state.filters.verifiedOnly = elements.verifiedOnly.checked;
  }

  function scheduleTypedSearch() {
    syncFiltersFromControls();
    state.error = null;
    clearSearchTimer();
    syncUrl();

    if (!hasTypedSearch()) {
      fetchLocations(state.center, state.centerLabel, state.centerSource);
      return;
    }

    state.loading = true;
    renderStatus();
    renderList();

    searchTimer = window.setTimeout(() => {
      searchTimer = null;
      fetchLocations(state.center, state.centerLabel, state.centerSource);
    }, config.searchDebounceMs);
  }

  function applyDiscreteFilters() {
    syncFiltersFromControls();
    state.error = null;
    clearSearchTimer();
    fetchLocations(state.center, state.centerLabel, state.centerSource);
  }

  elements.useLocation.addEventListener("click", requestCurrentLocation);
  elements.useFallback.addEventListener("click", () =>
    fetchLocations(
      {
        lat: config.fallbackCenter.lat,
        lng: config.fallbackCenter.lng
      },
      config.fallbackCenter.label,
      "fallback"
    )
  );
  elements.searchInput.addEventListener("input", scheduleTypedSearch);
  elements.categoryInput.addEventListener("input", scheduleTypedSearch);
  elements.radiusSelect.addEventListener("change", applyDiscreteFilters);
  elements.verifiedOnly.addEventListener("change", applyDiscreteFilters);
  elements.addLocationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAddLocation();
  });
  elements.addLocationSubmitAnyway.addEventListener("click", () => submitAddLocation({ ignoreDuplicateWarning: true }));
  elements.addLocationCancelWarning.addEventListener("click", () => {
    clearDuplicateWarning();
    resetAddLocationFeedback();
    renderAddLocation();
  });

  for (const field of [
    elements.addLocationName,
    elements.addLocationCategory,
    elements.addLocationAddress,
    elements.addLocationNotes
  ]) {
    field.addEventListener("input", () => {
      clearDuplicateWarning();
      resetAddLocationFeedback();
      renderAddLocation();
    });
  }

  for (const button of elements.tabButtons) {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  }

  applyStateToControls();
  renderAddLocation();

  if (state.center || hasSearchCriteria()) {
    fetchLocations(state.center, state.centerLabel, state.centerSource);
    return;
  }

  renderStatus();
  renderList();
})();
