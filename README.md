# Gasballoon Cockpit

A single-file HTML web app for gas balloon flight planning and in-flight monitoring: live position tracking, wind-based landing predictions, staged descent planning, weather stations, air traffic, and offline map caching - built for use on a tablet in the basket.

**Current version: v260809.06-2245** (09.08.2026) - this number always matches the `APP_VERSION` constant near the top of the script in `index.html`. Versioning scheme: `vYYMMDD.zz-HHMM` (date of the last change + a 2-digit counter that resets to 01 each new day + the build time), so multiple same-day builds are unambiguous at a glance - helpful for confirming a deployment actually picked up the latest one, not a stale cached build. `cors_test.html`'s own version marker is kept in sync with this.

## What it is

One HTML file, no build step, no server. Open it in a browser (or install it to a home screen as a PWA) and it runs entirely client-side, calling a handful of free public weather/mapping APIs directly from the browser. A service worker (`sw.js`) caches map tiles and weather data for offline use once pre-cached around a chosen area.

Password gate on load (SHA-256 hashed, set in `GATE_HASH`).

## Main functions

The app has two main functions, switched via a pill toggle at the top of the map:

### Landing Area (default)

Shows the balloon's live predicted trajectory: a cruise segment (green) that transitions into a descent (yellow) at a configurable time ("Initiate descent in"), continuously recalculated as position, altitude, and wind data update. A Monte Carlo scatter of likely landing points (accounting for descent-rate uncertainty) is shown as a shaded polygon around the predicted landing point.

The descent point (a yellow cross on the trajectory) can be adjusted two ways that stay in sync: the "Initiate descent in" slider, or dragging the cross itself along the trajectory - both update the same underlying value, so the landing prediction keeps recalculating dynamically from the balloon's actual current position and altitude either way.

**Extended trajectory preview**: click anywhere within roughly 60° of the trajectory's own direction, beyond where the normal prediction/landing area already reaches, to see the trajectory extended further out (blue) - reaching past the cached map area if the weather model still has data that far out. It's a frozen snapshot from the moment of the click (not recomputed as the balloon moves), useful for comparing the real flown track against an earlier prediction. Two close (✕) buttons - one at each end - remove it; the one at the start follows the balloon at a safe offset until it's far enough away to snap onto the trajectory's own fixed starting point.

A one-time onboarding hint appears the first time this function is used, highlighting the sliders that most directly shape the prediction.

### Plan Descent

Has two sub-functions, switched via a smaller toggle directly under the main "Plan Descent" button:

**Quick Descent** (default): click any point on the map to find the nearest reachable landing area and the descent path to it - shown as an orange cross on the trajectory (the calculated descent point) and a yellow descent path, same visual language as Landing Area's own live prediction. The reference trajectory (green, ~2h horizon) truncates at the descent point once a plan is active - the stretch beyond it is where the descent path takes over instead. The descent point can then be dragged forward (into the trajectory's now-hidden continuation) or backward (within the still-visible part) to explore alternatives, or a new point can be clicked anywhere to restart from the nearest reachable area. The clicked landing target itself (red circle with a red dot) stays wherever it was placed.

**Staged Descent**: drag a royal-blue cross marker along the trajectory to choose when descent begins, then click within the resulting reachable area (shown once the marker is placed) to search for a staged descent plan - one that pauses at one or more intermediate altitudes (chosen automatically where wind conditions genuinely differ) rather than descending in one continuous run. Opens a side panel with a chart of the planned stages: altitude, wind at each level, duration, an estimated ballast requirement for each transition, and markers for any wind shear, inversion, or isothermal layers encountered. Two parameters specific to this sub-function (minimum stage separation, maximum intermediate stages) live directly in this panel rather than in Settings.

Both sub-functions show a one-time onboarding hint on first use.

### Flight data box

A small draggable panel next to the balloon marker showing course, speed (km/h and kn), climb/sink rate, and altitude (m AMSL, ft, flight level above a configurable transition altitude, and AGL). Persists across both main functions - closing it only dismisses it until the next switch between them, at which point it reopens wherever it last was.

## Data sources

| Source | Used for | Status |
|---|---|---|
| Open-Meteo | Wind profiles, elevation, precipitation | Working. Free tier has a daily request quota - if it's exhausted, a banner explains that no wind data is available rather than failing silently. |
| SondeHub | Radiosonde launches, for using real sounding data instead of the model | Working |
| api.existenz.ch (SwissMetNet) | Swiss weather stations | Working |
| Bright Sky | German weather stations | Working |
| MeteoGate/E-SOH | Weather stations across the rest of Europe (33 countries) | Station list loads; per-station value parsing is not yet fully confirmed against a live response |
| ADSBExchange (via RapidAPI) + OGN/glidernet.org | Air traffic, deduplicated where both sources report the same aircraft | Working |
| RainViewer | Rain radar | Working |
| Overpass API | Airspace, terrain, roads, region names (multiple mirror fallbacks) | Working, occasionally rate-limited under load (a fallback mirror usually picks up the slack) |
| Nominatim | Reverse geocoding for landing-area place names | Working |
| MetarCentral | Airport METARs | **Working again as of 09.08.2026** (confirmed live). Was CORS-blocked for most of this app's development - something changed on their side; kept as a note in case it becomes intermittent again. |
| aprs.fi | APRS station tracking | **CORS-blocked from the browser, confirmed with a live key.** Settings clearly label this as non-functional. |
| Xweather | Lightning (only polls when rain is detected nearby) | Implemented but not yet confirmed against real credentials |

## Settings

Organized into color-coded groups: General (cache radius, transition altitude, units), Weather (model selection, sonde data, METAR/station sources, lightning), Air Traffic & Airspace, Terrain & Ground Features, Descent Planning (adiabatic model), Safety & Positioning (external GPS, emergency contact), and Data & Backup. API keys/tokens are collapsed into their own section.

**Profile backup**: export/import as a JSON file (native share sheet on mobile), or back up encrypted to a GitHub Gist (AES-GCM + PBKDF2, password-protected).

**Emergency contact**: pilot name, aircraft registration, mobile number, and email, with prepared-message sending over WhatsApp, SMS, or email (via mailto, or silently via EmailJS if configured).

## Known limitations

- Adiabatic braking and Monte Carlo scatter are approximations, not calibrated against real flight data - a planning aid, not a certified instrument.
- MetarCentral and aprs.fi are confirmed non-functional (browser CORS restrictions on their end, not fixable from this app).
- This is a static file with no server: after any change, it has to be re-uploaded to wherever it's hosted (e.g. GitHub Pages) before the live site reflects it, and GitHub Pages deployments can occasionally fail/time out on GitHub's own infrastructure - worth checking the Actions tab if a new version doesn't appear after uploading.
- Cloud file pickers (Dropbox, Google Drive, etc.) shown when uploading a file are controlled by iOS/the browser based on installed provider apps, not by this page.
- When installed as a home-screen web app on iOS, the layout respects the device's safe area (status bar, home indicator) via `env(safe-area-inset-*)`, so it shouldn't sit underneath the system status bar.
- Course, speed, and climb/sink rate are all derived from consecutive GPS fixes and include a plausibility cap (rejecting implied speeds above ~200km/h or vertical rates above ~20m/s) to filter out indoor/poor-signal GPS jitter, which can otherwise report large position or altitude jumps between fixes even while genuinely stationary. Speed is explicitly zeroed (not just left unchanged) when consecutive fixes show no meaningful movement; course shows "---°" until real movement has ever been observed, rather than an arbitrary default heading.
- If a specific weather model is manually selected but doesn't actually cover the current position (e.g. ICON-D2 outside its DACH/Central Europe coverage), the app falls back to auto-selection and shows a clear warning rather than silently requesting an inappropriate model. Tap the model name in the header to refresh it on demand.
- Ground elevation (for AGL) is refreshed on the very first real GPS fix of a session unconditionally, not just distance-debounced afterwards - covers both the main GPS watch loop and the separate one-time fix used when returning to live GPS from Test Mode, which previously had no refresh logic of its own at all.
- The flight data box snaps flush against the top of the map if dragged above it, rather than being left free to overlap the header/banner area.
- Ground elevation (used for the AGL figure) refreshes automatically as GPS position changes by more than 500m, not just at app start - a real position more than 500m from wherever it was last fetched will briefly show an AGL based on the previous location's elevation until the next fix triggers a refresh.
