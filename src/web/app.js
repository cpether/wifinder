(function () {
  const bootstrapElement = document.getElementById("app-bootstrap");
  if (!bootstrapElement) {
    return;
  }

  const config = JSON.parse(bootstrapElement.textContent);
  const radiusOptions = Array.isArray(config.radiusOptions) && config.radiusOptions.length > 0
    ? config.radiusOptions
    : [config.defaultRadius];
  const hasStatusBanner = Boolean(document.getElementById("status-banner"));
  const hasAddLocationUi = Boolean(document.getElementById("add-location-form"));
  const DARK_MAP_STYLES = [
    { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
    { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#111827" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#334155" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#cbd5e1" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#172033" }] },
    { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#020617" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#60a5fa" }] }
  ];

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
      verifiedOnly: params.get("verified") === "true",
      addLocationName: params.get("name") || "",
      addLocationAddress: params.get("address") || "",
      addLocationCategory: params.get("newCategory") || ""
    };
  }

  const elements = {
    useLocation: document.getElementById("use-location"),
    useFallback: document.getElementById("use-fallback"),
    searchInput: document.getElementById("search-input"),
    searchSubmit: document.getElementById("search-submit"),
    categoryInput: document.getElementById("category-input"),
    radiusSelect: document.getElementById("radius-select"),
    verifiedOnly: document.getElementById("verified-only"),
    addLocationForm: document.getElementById("add-location-form"),
    addLocationName: document.getElementById("add-location-name"),
    addLocationCategory: document.getElementById("add-location-category"),
    addLocationLocationSummary: document.getElementById("add-location-location-summary"),
    addLocationAddress: document.getElementById("add-location-address"),
    addLocationUseCurrent: document.getElementById("add-location-use-current"),
    addLocationPlacePin: document.getElementById("add-location-place-pin"),
    addLocationNotes: document.getElementById("add-location-notes"),
    addLocationFeedback: document.getElementById("add-location-feedback"),
    addLocationDuplicateWarning: document.getElementById("add-location-duplicate-warning"),
    addLocationDuplicateSummary: document.getElementById("add-location-duplicate-summary"),
    addLocationDuplicateList: document.getElementById("add-location-duplicate-list"),
    addLocationSubmit: document.getElementById("add-location-submit"),
    addLocationSubmitAnyway: document.getElementById("add-location-submit-anyway"),
    addLocationCancelWarning: document.getElementById("add-location-cancel-warning"),
    statusBanner: document.getElementById("status-banner"),
    resultsHeading: document.getElementById("stitch-results-heading"),
    resultsToggle: document.getElementById("stitch-results-toggle"),
    list: document.getElementById("location-list"),
    mapCanvas: document.getElementById("map-canvas"),
    mapOverlay: document.getElementById("map-overlay"),
    categoryChips: Array.from(document.querySelectorAll("[data-category-chip]")),
    tabButtons: Array.from(document.querySelectorAll("[data-tab]")),
    panels: {
      list: document.getElementById("panel-list"),
      map: document.getElementById("panel-map")
    }
  };

  let mapPromise = null;
  let map = null;
  let userMarker = null;
  let addLocationMarker = null;
  let markers = [];
  let infoWindow = null;
  let searchTimer = null;
  let requestSequence = 0;
  let deviceToken = null;
  let addLocationAutocomplete = null;
  let addLocationGeocoder = null;
  let searchPlacesApi = null;
  let markerApi = null;
  let coreApi = null;
  let mapCalloutOverlay = null;
  const mapOverlayHome = elements.mapOverlay?.parentNode ?? null;
  let mapClickListenerAttached = false;

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

  function getCurrentTheme() {
    return document.documentElement?.getAttribute("data-theme") || "light";
  }

  function getConfiguredMapId() {
    if (!config.googleMapsMapId || config.googleMapsMapId === "DEMO_MAP_ID") {
      return null;
    }
    return config.googleMapsMapId;
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
    syncMapTheme();
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

  if (elements.resultsToggle) {
    elements.resultsToggle.addEventListener("click", function () {
      const expanded = elements.resultsToggle.getAttribute("aria-expanded") === "true";
      setResultsRailExpanded(!expanded);
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
    placeCandidate: null,
    addLocation: {
      submitting: false,
      error: null,
      success: null,
      duplicates: [],
      pendingPayload: null,
      selectedLocation: initialState.center,
      selectedLabel: initialState.centerLabel,
      selectedSource: initialState.center ? "browse-center" : null,
      pinPlacementMode: false
    }
  };
  deviceToken = getStoredDeviceToken();

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

  function normalizeText(value) {
    return String(value ?? "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, " ")
      .trim()
      .replaceAll(/\s+/g, " ");
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
    updateCategoryChips();
  }

  function updateCategoryChips() {
    if (!elements.categoryChips.length) {
      return;
    }

    const normalizedCategory = normalizeCategory().toLowerCase();
    for (const chip of elements.categoryChips) {
      const isActive = chip.dataset.categoryChip === normalizedCategory;
      chip.classList.toggle("stitch-chip--active", isActive);
      chip.setAttribute("aria-pressed", String(isActive));
    }
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

  function setResultsRailExpanded(expanded) {
    if (!elements.panels.list?.classList || !elements.resultsToggle) {
      return;
    }

    elements.panels.list.classList.toggle("stitch-results-rail--collapsed", !expanded);
    elements.resultsToggle.textContent = expanded ? "Hide" : "See all";
    elements.resultsToggle.setAttribute("aria-expanded", String(expanded));
  }

  function submitSearchFromControls() {
    state.searchQuery = elements.searchInput.value;
    state.filters.category = elements.categoryInput.value;
    resetAddLocationFeedback();
    clearDuplicateWarning();
    fetchLocations(state.center, state.centerLabel, state.centerSource);
  }

  function renderStatus() {
    if (!hasStatusBanner) {
      return;
    }

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

    if (elements.resultsHeading) {
      const setResultsHeading = (count, label) => {
        elements.resultsHeading.innerHTML = `<span class="stitch-results-count">${escapeHtml(count)}</span> <span class="stitch-results-label">${escapeHtml(label)}</span>`;
      };

      if (!state.center && !hasSearchCriteria() && !state.loading) {
        setResultsHeading("0", "results near you");
      } else if (state.loading) {
        elements.resultsHeading.textContent = "Searching near you";
      } else if (state.placeCandidate) {
        setResultsHeading("1", "result near you");
      } else if (state.locations.length === 0) {
        if (mode === "search" && searchQuery) {
          elements.resultsHeading.textContent = `No results for "${searchQuery}"`;
        } else {
          setResultsHeading("0", "results near you");
        }
      } else if (mode === "search" && searchQuery) {
        elements.resultsHeading.textContent = `${state.locations.length} result${state.locations.length === 1 ? "" : "s"} for "${searchQuery}"`;
      } else {
        setResultsHeading(
          String(state.locations.length),
          `result${state.locations.length === 1 ? "" : "s"} near you`
        );
      }
    }

    if (!state.center && !hasSearchCriteria() && !state.loading) {
      elements.list.innerHTML =
        '<article class="empty-state">Use your location, Central London, or the search bar to start discovery.</article>';
      return;
    }

    if (state.loading) {
      elements.list.innerHTML =
        '<article class="empty-state">Fetching the latest venue results from the API.</article>';
      return;
    }

    if (state.locations.length === 0) {
      if (state.placeCandidate) {
        elements.list.innerHTML = buildPlaceCandidateListMarkup(state.placeCandidate);
        return;
      }

      elements.list.innerHTML = mode === "search"
        ? `<article class="empty-state">${searchQuery ? `Try a broader search for "${escapeHtml(searchQuery)}".` : "Try relaxing a filter or widening the radius."}</article>`
        : '<article class="empty-state">Try another area or widen the search radius.</article>';
      return;
    }

    const locationMarkup = state.locations
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

    const candidateMarkup = state.placeCandidate ? buildPlaceCandidateListMarkup(state.placeCandidate) : "";

    elements.list.innerHTML = `${candidateMarkup}${locationMarkup}`;
  }

  function clamp(value, min, max) {
    if (max < min) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  function normalizeLatLngLiteral(location) {
    if (!location || typeof location !== "object") {
      return null;
    }

    if (typeof location.lat === "number" && Number.isFinite(location.lat) && typeof location.lng === "number" && Number.isFinite(location.lng)) {
      return {
        lat: location.lat,
        lng: location.lng
      };
    }

    return toLatLngLiteral(location);
  }

  function resetMapOverlayPosition() {
    if (!elements.mapOverlay) {
      return;
    }

    elements.mapOverlay.style.left = "";
    elements.mapOverlay.style.top = "";
    elements.mapOverlay.style.right = "";
    elements.mapOverlay.style.bottom = "";
    elements.mapOverlay.style.transform = "";
  }

  function restoreMapOverlayHome() {
    if (!elements.mapOverlay || !mapOverlayHome || typeof mapOverlayHome.appendChild !== "function") {
      return;
    }

    if (elements.mapOverlay.parentNode !== mapOverlayHome) {
      mapOverlayHome.appendChild(elements.mapOverlay);
    }
  }

  function drawMapCalloutOverlay(overlayView) {
    if (!elements.mapOverlay || !overlayView) {
      return;
    }

    const normalizedAnchor = normalizeLatLngLiteral(overlayView.anchorLocation);
    const projection = typeof overlayView.getProjection === "function" ? overlayView.getProjection() : null;
    if (!normalizedAnchor || !projection || typeof projection.fromLatLngToDivPixel !== "function") {
      resetMapOverlayPosition();
      return;
    }

    const latLng = typeof google.maps?.LatLng === "function"
      ? new google.maps.LatLng(normalizedAnchor.lat, normalizedAnchor.lng)
      : normalizedAnchor;
    const point = projection.fromLatLngToDivPixel(latLng);
    if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
      resetMapOverlayPosition();
      return;
    }

    const anchorOffset = 20;
    elements.mapOverlay.style.left = `${point.x}px`;
    elements.mapOverlay.style.top = `${point.y - anchorOffset}px`;
    elements.mapOverlay.style.right = "auto";
    elements.mapOverlay.style.bottom = "auto";
    elements.mapOverlay.style.transform = "translate(-50%, -100%)";
  }

  function ensureMapCalloutOverlay() {
    if (mapCalloutOverlay || !map || !elements.mapOverlay || !google.maps?.OverlayView) {
      return mapCalloutOverlay;
    }

    const overlayView = new google.maps.OverlayView();
    overlayView.anchorLocation = null;
    overlayView.isAttached = false;
    overlayView.onAdd = function () {
      const panes = typeof this.getPanes === "function" ? this.getPanes() : null;
      const pane = panes?.floatPane || panes?.overlayMouseTarget || panes?.overlayLayer;
      if (!pane || typeof pane.appendChild !== "function") {
        return;
      }

      pane.appendChild(elements.mapOverlay);
      this.isAttached = true;
    };
    overlayView.draw = function () {
      drawMapCalloutOverlay(this);
    };
    overlayView.onRemove = function () {
      this.isAttached = false;
      resetMapOverlayPosition();
      restoreMapOverlayHome();
    };

    mapCalloutOverlay = overlayView;
    return mapCalloutOverlay;
  }

  function showMapCalloutOverlay(markup, anchorLocation) {
    if (!elements.mapOverlay) {
      return;
    }

    const normalizedAnchor = normalizeLatLngLiteral(anchorLocation);
    elements.mapOverlay.hidden = false;
    elements.mapOverlay.innerHTML = markup;

    const overlayView = ensureMapCalloutOverlay();
    if (!overlayView || !normalizedAnchor) {
      resetMapOverlayPosition();
      return;
    }

    overlayView.anchorLocation = normalizedAnchor;

    if (!overlayView.isAttached && typeof overlayView.setMap === "function") {
      overlayView.setMap(map);
      return;
    }

    if (typeof overlayView.draw === "function") {
      overlayView.draw();
    }
  }

  function renderMapMessage(message) {
    hideMapOverlay();
    elements.mapOverlay.hidden = false;
    elements.mapOverlay.innerHTML = "";
    elements.mapOverlay.textContent = message;
    resetMapOverlayPosition();
  }

  function renderMapCallout(place, existingLocation, anchorLocation) {
    if (!elements.mapOverlay) {
      return;
    }

    const actionMarkup = existingLocation
      ? `<div class="location-meta"><div>WiFi details are already listed in the results below.</div></div>`
      : `<a class="btn btn-primary btn-sm" href="${escapeHtml(buildAddLocationHref(place))}">Add WiFi details</a>`;

    showMapCalloutOverlay(
      `<div style="display:grid;gap:0.5rem">
        <div>
          <strong>${escapeHtml(place.name || "Selected map location")}</strong><br>
          <span>${escapeHtml(place.address || "Pinned point on the map")}</span>
        </div>
        ${actionMarkup}
      </div>`,
      anchorLocation ?? place
    );
  }

  function hideMapOverlay() {
    if (!elements.mapOverlay) {
      return;
    }

    if (mapCalloutOverlay && typeof mapCalloutOverlay.setMap === "function") {
      mapCalloutOverlay.setMap(null);
    }
    mapCalloutOverlay = null;
    elements.mapOverlay.hidden = true;
    elements.mapOverlay.innerHTML = "";
    elements.mapOverlay.textContent = "";
    resetMapOverlayPosition();
    restoreMapOverlayHome();
  }

  function closeInfoWindow() {
    hideMapOverlay();
    if (infoWindow && typeof infoWindow.close === "function") {
      infoWindow.close();
    }
  }

  function clearMarker(marker) {
    if (!marker) {
      return;
    }

    if (typeof marker.setMap === "function") {
      marker.setMap(null);
      return;
    }

    marker.map = null;
  }

  function clearMapMarkers() {
    for (const marker of markers) {
      clearMarker(marker);
    }
    markers = [];
  }

  function clearAddLocationMarker() {
    if (!addLocationMarker) {
      return;
    }
    clearMarker(addLocationMarker);
    addLocationMarker = null;
  }

  function syncMapTheme() {
    if (!map || !window.google || !window.google.maps) {
      return;
    }

    recreateMapForTheme();
  }

  function getMapOptions(overrides = {}) {
    const theme = getCurrentTheme();
    const mapId = getConfiguredMapId();
    const useCloudStyledMap = Boolean(mapId);
    const colorScheme = coreApi?.ColorScheme
      ? theme === "dark"
        ? coreApi.ColorScheme.DARK
        : coreApi.ColorScheme.LIGHT
      : undefined;
    return {
      center: state.center || config.fallbackCenter,
      zoom: 13,
      clickableIcons: true,
      disableDefaultUI: true,
      zoomControl: true,
      fullscreenControl: false,
      streetViewControl: false,
      mapTypeControl: false,
      gestureHandling: config.mapGestureHandling || "auto",
      mapId,
      colorScheme,
      styles: theme === "dark" && !useCloudStyledMap ? DARK_MAP_STYLES : null,
      ...overrides
    };
  }

  function recreateMapForTheme() {
    if (!map || !elements.mapCanvas) {
      return;
    }

    const center = typeof map.getCenter === "function" ? map.getCenter() : map.center;
    const zoom = typeof map.getZoom === "function" ? map.getZoom() : map.zoom;

    clearMapMarkers();
    clearAddLocationMarker();
    if (userMarker) {
      clearMarker(userMarker);
      userMarker = null;
    }
    if (infoWindow && typeof infoWindow.close === "function") {
      infoWindow.close();
    }
    infoWindow = null;
    if (mapCalloutOverlay && typeof mapCalloutOverlay.setMap === "function") {
      mapCalloutOverlay.setMap(null);
    }
    mapCalloutOverlay = null;

    map = new google.maps.Map(elements.mapCanvas, getMapOptions({ center, zoom }));
    mapClickListenerAttached = false;

    ensureAddLocationMapTools();
    updateMapMarkers();
  }

  function getMarkerPalette(kind) {
    if (kind === "user") {
      return { background: "#2563eb", borderColor: "#1d4ed8", glyphColor: "#ffffff" };
    }
    if (kind === "draft") {
      return { background: "#16a34a", borderColor: "#15803d", glyphColor: "#ffffff" };
    }
    return { background: "#ef4444", borderColor: "#dc2626", glyphColor: "#ffffff" };
  }

  function createMarker(position, title, kind = "result") {
    if (markerApi?.AdvancedMarkerElement && getConfiguredMapId()) {
      const markerOptions = {
        map,
        position,
        title
      };

      if (markerApi.PinElement) {
        const palette = getMarkerPalette(kind);
        const pin = new markerApi.PinElement({
          background: palette.background,
          borderColor: palette.borderColor,
          glyphColor: palette.glyphColor
        });
        markerOptions.content = pin;
      }

      return new markerApi.AdvancedMarkerElement(markerOptions);
    }

    return new google.maps.Marker({
      map,
      position,
      title
    });
  }

  function renderExistingLocationCallout(location) {
    if (!location) {
      return;
    }

    renderMapCallout(
      {
        name: location.name,
        address: location.address || `${location.category} · ${formatDistance(location.distance_m)}`,
        lat: location.lat,
        lng: location.lng
      },
      location,
      { lat: location.lat, lng: location.lng }
    );
  }

  function updateMapMarkers() {
    if (!map) {
      return;
    }

    clearMapMarkers();

    if (userMarker) {
      clearMarker(userMarker);
      userMarker = null;
    }

    clearAddLocationMarker();

    if (state.center) {
      userMarker = createMarker(state.center, "You are here", "user");
    }

    if (state.addLocation.selectedLocation) {
      addLocationMarker = createMarker(
        state.addLocation.selectedLocation,
        state.addLocation.selectedLabel || "New venue pin",
        "draft"
      );
    }

    for (const location of state.locations) {
      const marker = createMarker(
        { lat: location.lat, lng: location.lng },
        location.name,
        "result"
      );
      const openLocationCallout = () => {
        renderExistingLocationCallout(location);
      };
      if (typeof marker.addEventListener === "function") {
        marker.addEventListener("gmp-click", openLocationCallout);
      } else if (typeof marker.addListener === "function") {
        marker.addListener("click", openLocationCallout);
      }
      markers.push(marker);
    }
  }

  function centerMapOnLocation(location) {
    if (!map || !location) {
      return;
    }

    if (typeof map.panTo === "function") {
      map.panTo(location);
      return;
    }

    if (typeof map.setCenter === "function") {
      map.setCenter(location);
    }
  }

  function shouldPinCurrentLocationAtMapCenter() {
    return Boolean(state.center && state.centerSource === "geolocation" && getRequestMode() === "nearby");
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
      centerMapOnLocation(state.center);
      map.setZoom(14);
      return;
    }

    map.fitBounds(bounds, 72);

    if (shouldPinCurrentLocationAtMapCenter()) {
      centerMapOnLocation(state.center);
    }
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
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsApiKey)}&libraries=places&loading=async&callback=${callbackName}`;
      script.async = true;
      script.onerror = () => {
        reject(new Error("Google Maps failed to load."));
        delete window[callbackName];
      };
      document.head.appendChild(script);
    });

    return mapPromise;
  }

  function initializeMap() {
    if (map || !window.google || !window.google.maps) {
      return;
    }

    map = new google.maps.Map(elements.mapCanvas, getMapOptions());
  }

  function ensureSearchServices() {
    if (!window.google || !window.google.maps) {
      return;
    }

    initializeMap();
  }

  function syncMap() {
    const searchQuery = normalizeSearchQuery();
    const mode = getRequestMode();

    if (!config.googleMapsApiKey) {
      renderMapMessage("Set GOOGLE_MAPS_API_KEY to enable the live Google Map. List view remains fully functional.");
      return;
    }

    loadGoogleMaps()
      .then(async () => {
        await getCoreApi();
        await getMarkerApi();
        if (!map) {
          initializeMap();
        }

        ensureAddLocationMapTools();

        updateMapMarkers();
        fitMapBounds();

        hideMapOverlay();
      })
      .catch((error) => {
        renderMapMessage(error.message);
      });
  }

  function getRequestMode() {
    return hasSearchCriteria() ? "search" : "nearby";
  }

  function getAddLocationCenter() {
    return state.addLocation.selectedLocation;
  }

  function setAddLocationSelection(location, label, source) {
    state.addLocation.selectedLocation = location;
    state.addLocation.selectedLabel = label;
    state.addLocation.selectedSource = source;
    state.addLocation.pinPlacementMode = false;
  }

  function syncAddLocationToBrowseCenter() {
    if (!hasAddLocationUi) {
      return;
    }

    state.addLocation.pinPlacementMode = false;
    const shouldTrackBrowseCenter =
      !state.addLocation.selectedLocation || state.addLocation.selectedSource === "browse-center";

    if (!shouldTrackBrowseCenter) {
      return;
    }

    if (!state.center) {
      state.addLocation.selectedLocation = null;
      state.addLocation.selectedLabel = null;
      state.addLocation.selectedSource = null;
      return;
    }

    setAddLocationSelection(state.center, state.centerLabel || "your selected area", "browse-center");
  }

  function buildAddLocationHref(place) {
    const params = new URLSearchParams();
    params.set("lat", String(place.lat));
    params.set("lng", String(place.lng));
    if (place.address || place.name) {
      params.set("label", place.address || place.name);
    }
    if (place.name) {
      params.set("name", place.name);
    }
    if (place.address) {
      params.set("address", place.address);
    }
    if (normalizeCategory()) {
      params.set("newCategory", normalizeCategory());
    }
    return `/v3/add?${params.toString()}`;
  }

  function findMatchingLocationForPlace(place) {
    if (!place) {
      return null;
    }

    const normalizedPlaceName = normalizeText(place.name);
    const normalizedPlaceAddress = normalizeText(place.address);

    return (
      state.locations.find((location) => {
        const nameMatch = normalizeText(location.name) === normalizedPlaceName;
        const addressMatch = normalizedPlaceAddress && normalizeText(location.address) === normalizedPlaceAddress;
        const closeMatch =
          typeof location.distance_m === "number" &&
          location.distance_m <= 120 &&
          normalizeText(location.name).includes(normalizedPlaceName);
        return nameMatch || addressMatch || closeMatch;
      }) ?? null
    );
  }

  function buildPlaceCandidateListMarkup(place) {
    return `<article class="location-card location-card--suggestion">
      <div style="display:grid;gap:0.5rem">
        <div style="display:flex;align-items:start;justify-content:space-between;gap:0.75rem">
          <div style="min-width:0">
            <h3>${escapeHtml(place.name)}</h3>
            <div class="location-meta">
              <div>${escapeHtml(place.address || "Place found on the map")}</div>
              <div>No WiFi details added yet.</div>
            </div>
          </div>
          <span class="chip">New place</span>
        </div>
        <a class="stitch-add-link" href="${escapeHtml(place.addHref)}">Add WiFi details</a>
      </div>
    </article>`;
  }

  function toLatLngLiteral(location) {
    if (!location || typeof location.lat !== "function" || typeof location.lng !== "function") {
      return null;
    }

    return {
      lat: location.lat(),
      lng: location.lng()
    };
  }

  function deriveCandidateName(address) {
    if (!address) {
      return "Selected map location";
    }

    const [firstSegment] = String(address)
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean);

    return firstSegment || "Selected map location";
  }

  function updatePlaceCandidate(place) {
    if (!place) {
      state.placeCandidate = null;
      return;
    }

    const hasMatch = Boolean(findMatchingLocationForPlace(place));

    state.placeCandidate = hasMatch
      ? null
      : {
          ...place,
          addHref: buildAddLocationHref(place)
        };
  }

  function hasMapsSupport() {
    return Boolean(config.googleMapsApiKey && window.google && window.google.maps);
  }

  function focusMapOnLocation(location, zoom = 16) {
    if (!map || !location) {
      return;
    }
    map.setCenter(location);
    map.setZoom(zoom);
    syncMap();
  }

  function reverseGeocodeAddLocation(location) {
    if (!hasAddLocationUi || !addLocationGeocoder || !location) {
      return;
    }

    addLocationGeocoder.geocode({ location }, (results, status) => {
      if (status !== "OK" || !Array.isArray(results) || results.length === 0) {
        renderAddLocation();
        return;
      }

      const [firstResult] = results;
      state.addLocation.selectedLabel = firstResult.formatted_address;
      if (!elements.addLocationAddress.value.trim()) {
        elements.addLocationAddress.value = firstResult.formatted_address;
      }
      renderAddLocation();
    });
  }

  function reverseGeocodeLocation(location) {
    if (!hasMapsSupport()) {
      return Promise.resolve(null);
    }

    addLocationGeocoder = addLocationGeocoder ?? new google.maps.Geocoder();

    return new Promise((resolve) => {
      addLocationGeocoder.geocode({ location }, (results, status) => {
        if (status !== "OK" || !Array.isArray(results) || results.length === 0) {
          resolve({
            name: "Selected map location",
            address: "",
            lat: location.lat,
            lng: location.lng
          });
          return;
        }

        const [firstResult] = results;
        const address = firstResult.formatted_address || "";
        resolve({
          name: deriveCandidateName(address),
          address,
          lat: location.lat,
          lng: location.lng
        });
      });
    });
  }

  async function findPlaceById(placeId, fallbackLocation) {
    ensureSearchServices();

    try {
      const { Place } = await getPlacesSearchApi();
      if (typeof Place !== "function") {
        throw new Error("Places library is unavailable.");
      }

      const place = new Place({
        id: placeId,
        requestedLanguage: navigator?.language || undefined
      });

      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "location"]
      });

      const resolvedLocation = toLatLngLiteral(place.location) ?? fallbackLocation ?? null;
      if (!resolvedLocation) {
        return null;
      }

      return {
        name: place.displayName || "Google Maps place",
        address: place.formattedAddress || "",
        lat: resolvedLocation.lat,
        lng: resolvedLocation.lng
      };
    } catch {
      if (!fallbackLocation) {
        return null;
      }

      return reverseGeocodeLocation(fallbackLocation);
    }
  }

  function openPlaceInfoWindow(place, position) {
    if (!place) {
      return;
    }

    const existingLocation = findMatchingLocationForPlace(place);
    renderMapCallout(place, existingLocation, position);
  }

  function isPlaceClickEvent(event) {
    return Boolean(event && typeof event === "object" && "placeId" in event && event.placeId);
  }

  function ensureAddLocationMapTools() {
    if (!hasMapsSupport()) {
      return;
    }

    addLocationGeocoder = addLocationGeocoder ?? new google.maps.Geocoder();

    if (!mapClickListenerAttached) {
      map.addListener("click", async (event) => {
        if (!state.addLocation.pinPlacementMode) {
          if (typeof event?.stop === "function") {
            event.stop();
          }

          const isPlaceClick = isPlaceClickEvent(event);
          const clickedLocation = toLatLngLiteral(event?.latLng);

          if (isPlaceClick) {
            const place = await findPlaceById(event.placeId, clickedLocation);
            if (!place) {
              return;
            }

            updatePlaceCandidate(place);
            renderList();
            openPlaceInfoWindow(place, clickedLocation || { lat: place.lat, lng: place.lng });
            return;
          }

          if (!clickedLocation) {
            return;
          }

          const candidate = await reverseGeocodeLocation(clickedLocation);
          updatePlaceCandidate(candidate);
          renderList();
          openPlaceInfoWindow(candidate, clickedLocation);
          return;
        }

        if (event?.placeId && typeof event.stop === "function") {
          event.stop();
        }

        const location = {
          lat: event.latLng.lat(),
          lng: event.latLng.lng()
        };
        setAddLocationSelection(location, null, "map-pin");
        reverseGeocodeAddLocation(location);
        resetAddLocationFeedback();
        clearDuplicateWarning();
        renderAddLocation();
        syncMap();
      });
      mapClickListenerAttached = true;
    }

    if (!addLocationAutocomplete && google.maps.places && elements.addLocationAddress) {
      addLocationAutocomplete = new google.maps.places.Autocomplete(elements.addLocationAddress, {
        fields: ["formatted_address", "geometry", "name"]
      });
      addLocationAutocomplete.addListener("place_changed", () => {
        const place = addLocationAutocomplete.getPlace();
        const geometryLocation = place?.geometry?.location;
        if (!geometryLocation) {
          state.addLocation.error = "Select a suggested address so we can place the venue pin.";
          state.addLocation.success = null;
          renderAddLocation();
          return;
        }

        const location = {
          lat: geometryLocation.lat(),
          lng: geometryLocation.lng()
        };
        const label = place.formatted_address || place.name || elements.addLocationAddress.value.trim();
        setAddLocationSelection(location, label, "address-search");
        elements.addLocationAddress.value = label;
        resetAddLocationFeedback();
        clearDuplicateWarning();
        renderAddLocation();
        focusMapOnLocation(location);
      });
    }
  }

  function resetAddLocationFeedback() {
    if (!hasAddLocationUi) {
      return;
    }

    state.addLocation.error = null;
    state.addLocation.success = null;
  }

  function clearDuplicateWarning() {
    if (!hasAddLocationUi) {
      return;
    }

    state.addLocation.duplicates = [];
    state.addLocation.pendingPayload = null;
  }

  function renderAddLocation() {
    if (!hasAddLocationUi) {
      return;
    }

    const addLocationCenter = getAddLocationCenter();
    const feedbackState = state.addLocation.pinPlacementMode
      ? "pending"
      : state.addLocation.submitting
        ? "pending"
        : state.addLocation.error
          ? "error"
          : state.addLocation.success
            ? "success"
            : "idle";
    const feedback = state.addLocation.pinPlacementMode
      ? "Pin placement is active. Tap the map to set the new venue."
      : state.addLocation.submitting
      ? "Checking for duplicates and saving your venue..."
      : state.addLocation.error ??
        state.addLocation.success ??
        "Choose a discovery area first, then add the venue details.";

    elements.addLocationFeedback.textContent = feedback;
    elements.addLocationFeedback.setAttribute("data-state", feedbackState);
    elements.addLocationLocationSummary.textContent = addLocationCenter
      ? state.addLocation.selectedSource === "address-search"
        ? `Venue pin set from ${state.addLocation.selectedLabel}.`
        : state.addLocation.selectedSource === "map-pin"
          ? `Venue pin placed on the map${state.addLocation.selectedLabel ? ` near ${state.addLocation.selectedLabel}` : ""}.`
          : `Venue pin will use ${state.addLocation.selectedLabel || "your selected area"}.`
      : "Pick your location or Central London above before submitting a new venue.";
    elements.addLocationLocationSummary.setAttribute(
      "data-state",
      state.addLocation.pinPlacementMode ? "pending" : addLocationCenter ? "success" : "idle"
    );
    elements.addLocationSubmit.disabled = state.addLocation.submitting;
    elements.addLocationUseCurrent.disabled = state.addLocation.submitting;
    elements.addLocationPlacePin.disabled = state.addLocation.submitting;
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
    if (!hasAddLocationUi) {
      throw new Error("Add WiFi is not available on this screen.");
    }

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

    if (state.addLocation.pinPlacementMode) {
      throw new Error("Tap the map to finish placing the venue pin before submitting.");
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
    setAddLocationSelection(
      { lat: location.lat, lng: location.lng },
      location.address || location.name,
      "browse-center"
    );
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
    if (!hasAddLocationUi) {
      return;
    }

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
    state.placeCandidate = null;
    closeInfoWindow();
    state.center = center;
    state.centerLabel = label;
    state.centerSource = centerSource;
    syncAddLocationToBrowseCenter();
    syncUrl();
    renderStatus();
    renderList();
    renderAddLocation();
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
      renderAddLocation();
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

  function runDatabaseSearch() {
    syncFiltersFromControls();
    state.placeCandidate = null;
    state.error = null;
    clearSearchTimer();
    fetchLocations(state.center, state.centerLabel, state.centerSource);
  }

  async function getPlacesSearchApi() {
    if (searchPlacesApi) {
      return searchPlacesApi;
    }

    if (!window.google || !google.maps || typeof google.maps.importLibrary !== "function") {
      throw new Error("Places library is unavailable.");
    }

    const placesLibrary = await google.maps.importLibrary("places");
    searchPlacesApi = {
      Place: placesLibrary.Place,
      SearchByTextRankPreference: placesLibrary.SearchByTextRankPreference
    };
    return searchPlacesApi;
  }

  async function getCoreApi() {
    if (coreApi) {
      return coreApi;
    }

    if (!window.google || !google.maps || typeof google.maps.importLibrary !== "function") {
      return null;
    }

    coreApi = await google.maps.importLibrary("core");
    return coreApi;
  }

  async function getMarkerApi() {
    if (markerApi) {
      return markerApi;
    }

    if (!window.google || !google.maps || typeof google.maps.importLibrary !== "function") {
      return null;
    }

    const markerLibrary = await google.maps.importLibrary("marker");
    markerApi = {
      AdvancedMarkerElement: markerLibrary.AdvancedMarkerElement,
      PinElement: markerLibrary.PinElement
    };
    return markerApi;
  }

  async function findPlaceByQuery(query) {
    ensureSearchServices();

    const { Place, SearchByTextRankPreference } = await getPlacesSearchApi();
    const request = {
      textQuery: query,
      fields: ["displayName", "formattedAddress", "location"],
      rankPreference: SearchByTextRankPreference?.RELEVANCE
    };

    if (state.center) {
      request.locationBias = {
        center: state.center,
        radius: Math.max(state.filters.radius, 5000)
      };
    }

    const response = await Place.searchByText(request);
    const place = Array.isArray(response?.places) ? response.places[0] : null;
    const location = place?.location;

    if (!place || !location || typeof location.lat !== "function" || typeof location.lng !== "function") {
      return null;
    }

    return {
      name: place.displayName || query,
      address: place.formattedAddress || "",
      lat: location.lat(),
      lng: location.lng()
    };
  }

  async function performPrimarySearch() {
    const query = elements.searchInput.value.trim();
    if (!query) {
      runDatabaseSearch();
      return;
    }

    if (!config.googleMapsApiKey) {
      runDatabaseSearch();
      return;
    }

    try {
      await loadGoogleMaps();
      const place = await findPlaceByQuery(query);
      if (!place) {
        runDatabaseSearch();
        return;
      }

      state.searchQuery = "";
      state.center = { lat: place.lat, lng: place.lng };
      state.centerLabel = place.name;
      state.centerSource = "place-search";
      clearSearchTimer();
      focusMapOnLocation(state.center, 15);
      await fetchLocations(state.center, state.centerLabel, state.centerSource);
      updatePlaceCandidate(place);
      renderList();
    } catch {
      runDatabaseSearch();
    }
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
  if (elements.searchSubmit) {
    elements.searchSubmit.addEventListener("click", performPrimarySearch);
  }
  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performPrimarySearch();
    }
  });
  elements.radiusSelect.addEventListener("change", applyDiscreteFilters);
  elements.verifiedOnly.addEventListener("change", applyDiscreteFilters);
  for (const chip of elements.categoryChips) {
    chip.addEventListener("click", () => {
      const nextCategory = chip.dataset.categoryChip ?? "";
      const currentCategory = normalizeCategory().toLowerCase();
      elements.categoryInput.value = currentCategory === nextCategory ? "" : nextCategory;
      state.filters.category = elements.categoryInput.value;
      updateCategoryChips();
      submitSearchFromControls();
    });
  }
  if (hasAddLocationUi) {
    elements.addLocationUseCurrent.addEventListener("click", () => {
      syncAddLocationToBrowseCenter();
      clearDuplicateWarning();
      resetAddLocationFeedback();
      renderAddLocation();
      syncMap();
    });
    elements.addLocationPlacePin.addEventListener("click", () => {
      if (!config.googleMapsApiKey) {
        state.addLocation.error = "Set GOOGLE_MAPS_API_KEY to place a venue pin on the map.";
        state.addLocation.success = null;
        renderAddLocation();
        return;
      }

      state.addLocation.pinPlacementMode = true;
      resetAddLocationFeedback();
      clearDuplicateWarning();
      renderAddLocation();
      setActiveTab("map");
      syncMap();
    });
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
  }

  for (const button of elements.tabButtons) {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  }

  applyStateToControls();
  if (hasAddLocationUi) {
    elements.addLocationName.value = initialState.addLocationName;
    elements.addLocationAddress.value = initialState.addLocationAddress;
    elements.addLocationCategory.value = initialState.addLocationCategory;
  }
  syncAddLocationToBrowseCenter();
  renderAddLocation();

  if (config.autoLocateOnLoad && !state.center && !hasSearchCriteria()) {
    requestCurrentLocation();
    return;
  }

  if (state.center || hasSearchCriteria()) {
    fetchLocations(state.center, state.centerLabel, state.centerSource);
    return;
  }

  renderStatus();
  renderList();
})();
