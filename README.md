# Gasballoon Cockpit

A single-file HTML web app for gas balloon flight planning and in-flight monitoring: live position tracking, wind-based landing predictions, staged descent planning, weather stations, air traffic, and offline map caching - built for use on a tablet in the basket.

**Current version: v260809.27-0900** (09.08.2026) - this number always matches the `APP_VERSION` constant near the top of the script in `index.html`. Versioning scheme: `vYYMMDD.zz-HHMM` (date of the last change + a 2-digit counter that resets to 01 each new day + the build time), so multiple same-day builds are unambiguous at a glance - helpful for confirming a deployment actually picked up the latest one, not a stale cached build. `cors_test.html`'s own version marker is kept in sync with this.

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
| MetarCentral | Airport METARs | **Working again as of 09.08.2026** (confirmed live). Airport lookup uses a curated list of ~54 major European airports first, falling back to a live global Overpass query (any OSM-tagged aerodrome with an ICAO code) whenever that list has no coverage nearby - works outside Europe too, not just within the curated list. |
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
- CAPE (convective instability) is now shown when available, with standard threshold-based colour coding (low/moderate/strong/extreme).
- The landing-point terrain check is an approximation, not a true line-of-sight/obstacle-clearance calculation - it samples elevation in a ring around the point (flagging terrain roughness) and checks OSM for nearby tagged buildings or forest, since actual obstacle heights aren't available from any free source used here.
- Not every weather model supports the CAPE variable - if a combined request fails, the app retries without CAPE rather than letting the whole wind fetch fail and misleadingly show "offline".
- The staged descent plan panel and the flight data box could previously end up positioned at the exact same spot (the sidebar's own left edge) - the panel now shifts below the box if they'd overlap.
- Quick Descent's map zoom, after computing a landing area, now focuses on the landing area itself rather than the full span from the balloon's current position to it (which effectively zoomed out to show the whole trajectory instead).
- The moon phase icon now renders as a filled SVG silhouette (matching the sun icon's style) instead of an emoji, alongside its illumination percentage - more consistent and legible across devices at small size than emoji rendering.
- The flight data box, when snapped to the top, now dynamically tracks the actual bottom edge of the header/warning-message stack (which also contains the Landing Area | Plan Descent buttons) rather than the map's raw top edge - it moves up or down automatically as banners appear or disappear, so it never ends up underneath them.
- Ground elevation (used for the AGL figure) refreshes automatically as GPS position changes by more than 500m, not just at app start - a real position more than 500m from wherever it was last fetched will briefly show an AGL based on the previous location's elevation until the next fix triggers a refresh.
- The moon phase now shows a small waxing/waning trend arrow next to its illumination percentage.
- "Initiate descent in" and "Descent rate" now sit side by side in one row instead of stacked, with their computed values (distance, adiabatically-adjusted effective rate) shown below each slider. Descent rate's own track is now a wedge shape that grows taller toward higher values, to visualize the accelerating descent speed - the draggable point itself still moves along a flat baseline (it's the fill behind it that changes shape, not the interaction itself).
- Test Mode in the header's "more" menu had its own ID-specific CSS (a compact colored header-button look, from before it lived in the menu) overriding the menu row style via higher CSS specificity - it now correctly matches the other menu rows, styled in reddish text as intended.
- "Sun at estimated landing" now shows the sun's azimuth (always 3 digits, e.g. 048°) and elevation, plus remaining time until evening civil twilight (ECT) rather than sunset - civil twilight extends usable outdoor light well past sunset, which is the more relevant cutoff for whether there's still enough light to see the landing terrain. Shown as HH:MM. The direction arrow rotates to point at the sun's actual azimuth.
- The flight data box's course reading is now always 3 digits (e.g. 065°).
- The flight data box now dims along with the map when switching to night mode - it previously kept its full-brightness white background regardless of the toggle, since it uses fixed colors rather than the app's theme variables.
- Reverted a recent, more complex repositioning rule for the staged descent plan panel (meant to avoid overlapping the flight data box) that turned out to cause the panel to render broken/off-screen - back to the simpler, previously-working positioning logic, plus a safety max-height with scroll so the panel can never exceed the viewport regardless of position.
- Found the actual root cause of the staged descent panel extending past the right screen edge: its fixed 350px width assumed the sidebar was always at least that wide, but the sidebar's own min-width is 280px - at that width the panel would overflow by 70px. Now dynamically constrained to the actual available space.
- Screen wake lock made more robust: re-acquires immediately if released while still in the foreground (not just on the next visibility change), plus a 30s periodic safety check that re-acquires the lock (or resumes the fallback video) if either was somehow lost.
- Both remaining descent sliders' draggable points now sit at the exact same visual height (both use the same compact positioning), and their computed-value badges match Intercept AGL/Rate below's styling exactly. All four descent parameter badges now also show an estimated ballast equivalent in parentheses.
- The staged descent chart's Intercept row (altitude, time, wind) now shares one consistent text baseline instead of three slightly different ones, and stage dwell-time labels sit closer to the step plot they describe.
- Fixed a bug where tapping the weather model chip's popover could permanently break the Settings button - it was setting `style.display='none'` directly on the settings panel, which overrides its own CSS-class-based open/close mechanism from then on regardless of clicks.
- "offline (cached)" on the weather model chip was shown for ANY error inside the wind-fetch function, not just genuine connectivity failures - now distinguishes real network errors (checked via navigator.onLine and the fetch error message) from other bugs, which now surface as an explicit error instead of a misleading "offline".
- Staged Descent's reference trajectory now extends as far as the "Initiate descent in" slider is currently set to, rather than a fixed 2h.
- Fixed the Monte-Carlo landing area's centre marker in Staged Descent, which was very often sitting at the polygon's edge rather than near the middle - the clicked target point was included as an actual hull vertex (to guarantee it's visually contained), but hull vertices sit on a convex hull's outer boundary by definition, so including it in a simple vertex-average pulled the "centre" toward the edge. The centre shown is now computed from the raw Monte-Carlo scatter only.
- Staged Descent's descent path now uses the same yellow colour and black outline as every other descent path in the app - it was previously a dashed orange line with no outline, the only one styled that way, which read as merely symbolic rather than a properly wind-simulated result (the underlying simulation itself was already correct).
- Switching from Staged Descent back to Landing Area now actually clears the descent path from the map as intended (the code comment already described this, but the removal call itself was missing) - the reachable area, Monte-Carlo landing area, and its centre marker are still left in place, same as before.
