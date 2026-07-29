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

## New in this round (v40)

- **Radiosonde CSV upload**: Settings → below Weather Model → "Upload CSV with sonde data". Expects columns `utc_time, altitude_m_msl, temperature_C, wind_speed_kt, wind_direction_from_deg` (comment lines starting with `#` are skipped). Applied automatically on upload; header shows a clear "⚠ Sonde Data Applied" indicator with the launch time and a "Cancel" button to switch back to the weather model (a "Use sonde data" button reappears next to the model name if you cancel without re-uploading). Auto-expires 12h after upload or on app restart (kept in memory only, never saved to disk).
- **Emergency message** now includes the nearest town to the landing area center and a Google Maps link to it.
- **Plan Descent bug fix**: the search for a matching descent-initiation time was still capped at 180 minutes after the "Initiate descent" slider was extended to 240 - fixed. Also added a warning note when the tapped point isn't closely achievable (only descent timing is varied to match it, not every point in the scatter-widened landing area is reachable this way).
- **Warning banners no longer cover the Landing Area / Plan Descent toggle** - it now shifts down automatically below any visible warnings.
- **Ground wind particle height slider**: a vertical slider above the center-map buttons, active while the particle layer is on, lets you pick any level from the ground up to current altitude + 1000m.
- **Longer particle comet trails** for clearer direction reading.
- **Second center-map button**: "center on landing area" alongside the existing "center on current position".
- **Dropbox auto-backup** for the flight log: Settings → enter your own Dropbox App Key (see below) and a folder path, connect once, and the GPX log backs up automatically every 10 minutes.

### Setting up Dropbox auto-backup
This requires your own free Dropbox app (Anthropic/Claude cannot provision one on your behalf):
1. Go to [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) → "Create app" → Scoped access → choose a folder or full access → give it a name.
2. Under "OAuth 2" → "Redirect URIs", add the exact URL where you host `index.html` (e.g. `https://yourname.github.io/yourrepo/`).
3. Under "Permissions", enable `files.content.write`.
4. Copy the "App key" into the app's Settings → Dropbox App Key field, set your folder path, and tap "Connect Dropbox".

## New in this round (v42)

- **Ground wind trend arrow**: the "Ground Wind at Landing Site" reading now shows ↗/↘/→ comparing the forecast speed at landing time against 1h earlier in the model, so you can see at a glance whether it's building or easing.
- **Adiabatic model rebuilt on real gas physics**: instead of a single two-point volume-ratio estimate with a guessed thermal time constant, the model now steps through the actual descent and integrates the enclosed H₂ gas *temperature* over time using: Poisson's adiabatic law per altitude step, H₂'s real specific heat capacity and gas constant, an envelope surface area derived geometrically from the configured volume (assumed spherical), and a convective heat-transfer coefficient that scales with descent rate. The resulting "virtual lift bonus" and actual braked descent rate are more physically grounded, though the convective coefficient itself is still an estimated parameter (no wind-tunnel data for the envelope) - this is exactly what the "Empirical variance factor" in Settings is for: tune it against your own logged flights.

## New in this round (v44)

- **No more scroll-sliders inside small sidebar boxes**: data cells now use `overflow:hidden` with ellipsis truncation and slightly smaller fonts, so nothing can trigger an internal scrollbar.
- **Slider layout**: the configured (brown) value now sits directly next to its slider's title; the computed (badge) value is right-aligned.
- **"Center height" renamed to "Landing Area Approx Height"**.
- **Adiabatic badge shortened** to "Adiab. ca X.X m/s, X.Xkg lift".
- **Hodograph fixed**: it lacked equal, symmetric axis scaling (the actual reason it didn't look like a normal hodograph) - now uses a shared ±range on both axes and a true 1:1 aspect ratio.
- **Wind Profile + Descent Hodograph combined** into one "Flight Charts" card, shown side by side as thumbnails; tapping either opens it larger in an overlay with a close button.
- **Map-bottom legend close buttons moved to the left edge** of each bar (Power Lines, Ground Wind).
- **"Landing Position" card renamed to "Projected Landing Area"**.
- **Vertical particle-height slider fixed for iPad/Safari**: it only had the Firefox/Chrome-desktop `writing-mode` trick, missing WebKit's own `-webkit-appearance: slider-vertical`, which is why it wasn't rendering on iPad.

## New in this round (v45)

- **Inversion/isothermal layer note** moved into "Projected Landing Area", as its own small box next to Ground Wind.
- **Ground wind direction arrow** rotation fixed (was 180° off).
- **Pilot/aircraft/contact fields** now also save on every keystroke, not just on blur - more robust against the app being backgrounded on iPad.
- **"Refresh now" + "Auto-refresh interval"** placed side by side to save space.
- **Balloon gas volume** is now a plain numeric input instead of a slider.
- **Dropbox troubleshooting**: Dropbox auto-creates the target folder on upload - you don't need to create it yourself. The exact Redirect URI to register in your Dropbox app is now shown with a Copy button in Settings, and OAuth errors (e.g. a redirect URI mismatch) are now shown in the status line instead of silently failing.
- **"Send on all channels"** button added to the emergency message panel (opens WhatsApp, SMS, and Email in one tap).
- **Power line legend** now includes all point symbols (tower, substation, plant, generator, transformer, compensator, switch), and only shows the categories currently enabled in Settings.
- **Nature reserves / protected areas layer** (new toggle button): drawn from OpenStreetMap data via Overpass (free, no API key, ODbL-licensed) - the official WDPA database was considered too but requires registration and restricts commercial use, so OSM's own protected-area tagging is used instead.

## New in this round (v46)

- **Vertical particle-height slider fixed (real bug)**: it had a leftover inline `style="display:none"` in the HTML, which always wins over CSS class-based show/hide rules - the slider could never actually appear no matter what the JS did. Now also shows the AMSL altitude alongside the AGL value.
- **Sidebar scrollbar no longer always visible**: switched from `overflow-y:scroll` (always shows a scrollbar track) to `overflow-y:auto` (only appears when actually needed), plus an overall compactness pass (smaller padding/gaps/chart heights) to reduce how much scrolling is needed in the first place - this is very likely what looked like "sliders in every box".
- **Map-bottom legend bars fixed (real bug)**: the shared `.banner-close` button class had `margin-left:auto` baked in from the red/yellow warning banners (where the button sits last); reused on the legend bars (where the button now sits first), that same rule pushed the *entire row* to the right. Fixed so it only applies where it belongs.
- **GPS-unavailable warning bar**: no longer bold, left-aligned instead of centered.
- **Removed the explanatory paragraph** at the bottom of "Projected Landing Area" to save space.
- **Hodograph now shows concentric speed-reference rings** (e.g. every few m/s), labeled, as in a standard hodograph plot.

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
