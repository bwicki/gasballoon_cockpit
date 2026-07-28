# Gas Balloon Landing Predictor (GBLP)

A single-page web app for long-distance gas balloon flights, designed to help plan a safe descent and landing area — including at night or above a closed cloud layer — based on the current position, live wind data, and configurable descent parameters.

**Current version:** v24 (27.07.2026)

⚠️ **This is a working prototype, not a certified aviation instrument.** All calculations (landing footprint, adiabatic braking, obstacle warnings) are simplified engineering approximations. Always cross-check against your own judgement, official weather briefings, and applicable airspace rules. See [Known limitations & approximations](#known-limitations--approximations) below.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | The entire app (UI, logic, styling) — this is the file you open in a browser. |
| `sw.js` | Service worker used for offline tile caching. **Must sit in the same folder as `index.html`** or offline caching won't activate. |

Both files must be uploaded together — `sw.js` alone does nothing, and `index.html` without `sw.js` still works but won't cache map tiles for offline use.

## Deployment (GitHub Pages)

1. Create (or reuse) a GitHub repository.
2. Upload `index.html` and `sw.js` to the repository root (or rename the html file to `index.html` if it isn't already).
3. In the repo settings, enable **GitHub Pages** for the branch/folder you uploaded to.
4. Open the resulting `https://<username>.github.io/<repo>/` URL — ideally on the actual device (iPad, 11", Chrome) you'll use in the balloon basket.
5. After any update, do a hard refresh (or clear the browser cache) so the new version is picked up instead of a cached old one.

**Do not upload a browser "Save Page As" export** — that produces a different, broken file structure (rewritten script tags, a `_files` folder of exported images) that will not work. Always upload the actual source files as provided.

### Why two files?
Offline tile caching (see below) uses a browser Service Worker, which for security reasons must be served as its own file from the same origin — it cannot be embedded inside `index.html` or loaded from a different domain.

## First-time setup

### Password gate
The app shows a password prompt on first load. **Default test password: `1234`** — change this before real use.

To set your own password without sending it to anyone:
1. Open the app in a real browser (not the local test file) and press F12 to open the developer console.
2. Run (replacing `YourPassword`):
   ```js
   crypto.subtle.digest('SHA-256', new TextEncoder().encode('YourPassword'))
     .then(b => console.log(Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('')))
   ```
3. Copy the printed hash.
4. In `index.html`, find the line `const GATE_HASH = '...'` and replace the hash value with your new one.
5. Re-upload the file.

**Important:** this is a *soft* gate only. GitHub Pages is static hosting with no server-side authentication — anyone opening the browser's developer tools can read the page source (including the password hash) and bypass the check. It stops casual visitors, not a determined one. For real access control, put the site behind something like Cloudflare Access, or host on a platform that supports real password protection (e.g. Netlify's paid tier).

### openAIP API key
The airspace layer uses a fixed API key baked into the code (`OPENAIP_API_KEY` constant near the top of the script), rather than an editable field, so it can't be accidentally cleared. If you need to change it, edit that constant directly. Note that because the repo/page is public, this key is visible to anyone viewing the page source — fine for a free-tier key with light usage, but don't put a paid/high-quota key there.

## Using the app

### Main map
- Pinch/drag to zoom and pan; switch base map style (Streets / Terrain / Satellite) via the layers control (top-right of the map).
- **🎯 button** (top-right of the map): recenters the map on the current position.
- **🟢 Landing Area / ✛ Plan Descent** toggle (top-left of the map): switches between the two primary functions:
  - **Landing Area** (default): continuously shows the computed landing footprint (green-filled, red dotted outline) based on current position, wind, and the descent parameters below.
  - **Plan Descent**: tapping inside the landing area computes exactly when/where to start descending to reach that specific spot, plus the nearest town and a copy-to-clipboard summary (e.g. for a WhatsApp message to the ground crew).

### Header (top bar)
From left to right: app title/version, layer toggles (⚡ power lines, 🛣️ roads & place names, ✈️ airspace, 🟢 landing area), weather model + GPS status, then on the right: altitude unit, ⚙️ settings, 🌙 day/night, 📷 screenshot/recording, and the Test/Manual Mode button.

### Sidebar
- **Current Position**: live DMS and compact-notation coordinates (WGS84), altitude AMSL/AGL, true course, and speed. Course and speed are derived from consecutive GPS fixes (like a real GPS track), not from the device's own heading/speed report.
- **Descent Parameters**: sliders for when to start descending, descent rate, intercept height AGL, descent rate after intercept, and a scatter factor controlling how wide the probability cone is.
- **Adiabatic Braking (H₂)**: shows both the nominal descent rate and an approximate physically-braked actual rate at intercept, plus the equivalent "virtual lift bonus" in kg (see [physics](#adiabatic-braking-model) below).
- **Landing Point Plan**: appears after using "Plan Descent" — shows the descent-initiation time/distance, nearest town, a vertical descent profile chart, and a hodograph.
- **Power Line Legend**: appears only when the power-line layer is switched on; explains the voltage color-coding and point symbols.

### ⚙️ Settings menu
- Weather model selection (Auto, or force a specific model)
- Power line category toggles (lines, towers, substations, plants, generators, transformers, compensators, switches) + "overhead lines only" filter
- Airspace class filters (A/B/C/D/E/G, restricted, prohibited, TMZ, RMZ)
- Offline tile pre-cache radius (10–1050 km, default 50 km)
- Altitude unit (m / ft / Flight Level) — mirrors the header dropdown

### Test Mode / Manual Mode
- **Test Mode**: opened deliberately via the header button, for ground testing. Tap the map to set a fictitious position; altitude, course, and speed become directly editable in the "Current Position" card (which gets a red border while active).
- **Manual Mode**: triggered automatically if GPS becomes unavailable — a red banner "CAUTION: GPS DATA not available!" appears with a "Manual Mode?" button. Clicking it opens the same inline editing described above, labeled "Manual Mode" instead. It closes automatically as soon as GPS data resumes.

### Offline tile caching
A Service Worker (`sw.js`) caches map/data tile requests (base map, power lines, airspace, roads/place names). On load, and every ~10 minutes if the balloon has moved far enough, the app pre-fetches tiles within the configured radius (default 50 km) around the current position, so they remain available if the connection drops. This uses real network bandwidth — fine on Starlink/5G, but be aware of data usage if your connection is metered.

---

## Data sources

| Data | Source | Notes |
|---|---|---|
| Wind profile (by pressure level) | [Open-Meteo](https://open-meteo.com) | Free, no API key. Underlying models (ICON, GFS, ECMWF) are from DWD/NOAA/ECMWF; Open-Meteo is the access layer. |
| Ground elevation | Open-Meteo Elevation API | Used for AGL and adiabatic calculations. |
| Base map tiles | OpenStreetMap, OpenTopoMap, Esri World Imagery | Via Leaflet. |
| Power infrastructure | [OpenInfraMap](https://openinframap.org) (vector tiles, via Leaflet.VectorGrid) | Only `power_*` sub-layers are rendered; other infra types (telecoms, water, petroleum) present in the same tiles are hidden. |
| Airspace / airports / navaids / reporting points | [openAIP](https://www.openaip.net) (single combined raster layer) | openAIP retired separate per-category tile endpoints in May 2023; everything (including VOR/navaids) now comes baked into one combined raster image, so individual categories/classes can no longer be filtered client-side. The "Airspace Classes" checkboxes in Settings are currently a non-functional placeholder for a possible future vector-tile implementation. |
| Roads overlay | Esri "World Transportation" reference layer | |
| Place name labels | Live OSM place nodes via Overpass API, rendered as real HTML markers with a boxed background (not a raster tile) | |
| Fine, class-styled roads (Satellite view only, zoom ≥ 14) | [OpenStreetMap Overpass API](https://overpass-api.de) | Live query for the current view; styled by road class (motorway/trunk red, primary–tertiary orange, residential/service light grey, track/path/footway dashed tan) — useful for planning the access route after landing, since satellite imagery alone shows no road classification. Public Overpass instance, so it may be slow or rate-limited under heavy use. |
| Reverse geocoding (nearest town) | OpenStreetMap Nominatim | |

---

## New in this round (v37)

- **Real obstacle warnings**: the descent path is now checked against real terrain elevation (Open-Meteo, sampled along the path) and real airspace polygons (openAIP **Core API**, not the raster tile layer) - warns if ground clearance drops below 50 m or the path crosses a mapped airspace. Debounced so it doesn't hammer these APIs on every slider tick. **Not covered**: power line collision - that would require parsing OpenInfraMap's raw vector tile data, which was out of scope here.
- **Wind-forecast uncertainty in the landing footprint**: each Monte-Carlo run now also samples a random wind-direction/speed perturbation whose magnitude grows with the model run's age, on top of the existing descent-rate scatter.
- **Emergency contact**: red header button opens a panel to prepare a position/altitude/course/landing-area report and send it via WhatsApp, SMS, or email (or just copy it).
- **Wind Profile card**: classic sounding-style speed-vs-altitude chart (direction shown in the tooltip), alongside the existing hodograph.
- **Hodograph toggle**: header button to show/hide the hodograph.
- **Ground wind particle layer**: animated, colour-coded (blue→green→yellow→orange→red by knots) particle flow representing wind in the 0-200 m AGL band, with a legend.
- **Flight logbook**: periodic position/altitude/course/speed logging (configurable interval), exportable as GPX or KML after landing; persists across reloads.
- **Configurable balloon volume + adiabatic variance factor**: in Settings, so the adiabatic braking model matches your actual envelope and can be empirically tuned against real flight data.
- **Settings persistence**: your configuration is saved automatically and restored on next launch; a "Reset all settings to defaults" button is available in Settings.
- **Experimental Bluetooth GPS**: best-effort support for BLE receivers exposing the standard "Location and Speed" characteristic (Bluetooth SIG spec 0x2A67). There is no universal BLE GPS standard for aviation receivers, so hardware compatibility varies - treat this as experimental, not a guaranteed integration.

## Known limitations & approximations

- **Model run age**: Open-Meteo's simple forecast endpoint doesn't return the exact model-run timestamp. The "run age" shown is *estimated* from each model's publicly documented update cadence (e.g. ICON-D2 every 3h, GFS every 6h, ECMWF every 12h) plus typical publication latency — a realistic estimate, not a value confirmed by the data source itself.
- **Adiabatic braking model**: assumes a fixed 1050 m³ H₂ envelope in force equilibrium at the current altitude, and compares adiabatic vs. isothermal gas compression from the current altitude down to the intercept altitude to estimate the "virtual lift bonus" and the resulting braked descent rate. The blend between fully-adiabatic and fully-isothermal behavior (based on how fast the descent happens) uses an assumed thermal relaxation time constant (~90 s) that hasn't been calibrated against a real envelope — treat the actual-rate number as a sanity-check estimate, not a certified value.
- **Landing footprint**: a 40-run Monte Carlo simulation varying descent rate by the configured scatter factor, using the currently loaded wind profile. It does not model wind forecast uncertainty itself, only the descent-rate scatter you configure.
- **Obstacle/collision warnings along the descent path**: currently only a basic ground-clearance placeholder — full terrain/power-line/airspace collision checking along the predicted descent path is not yet implemented.
- **Power line visibility at low zoom**: OpenInfraMap's tile source only includes lower-voltage lines once you zoom in far enough (roughly zoom ≥ 8 shows all voltages; below that, only higher-voltage transmission lines are included, to limit tile size). This is a property of their tile server, not something this app can override — if you only see substation/tower points and no lines, zoom in.
- **openAIP airspace layer is raster (pre-rendered images)**, not vector data, so individual features within it (e.g. a specific airspace boundary) can't be re-styled or queried from this app — only whole categories (airspaces / airports / reporting points) can be shown or hidden.
- **Password gate is client-side only** (see [First-time setup](#first-time-setup)) — not a substitute for real access control if that matters for your use case.

---

## Device requirements

- Designed for an 11" iPad running Chrome, but works in any modern browser (desktop window works best with a portrait aspect ratio similar to an 11" iPad).
- **Strongly recommended for real flight use**: add the page to the iPad Home Screen (Share button → "Add to Home Screen") and launch it from there, rather than as a normal browser tab. This removes Safari/Chrome's own address bar and toolbar entirely, which is the only fully reliable way to stop iOS from occasionally showing/hiding browser chrome on scroll gestures - a known iOS quirk that CSS alone can reduce but not 100% eliminate when running in a regular browser tab.
- Requires an internet connection for live data (GPS itself works offline, but wind/weather, elevation, reverse geocoding, and any non-cached map tiles require connectivity).
- Screen recording uses `getDisplayMedia`, which requires explicit browser permission each session.
- The screen is kept awake automatically (Wake Lock API) while the app is open and visible.
