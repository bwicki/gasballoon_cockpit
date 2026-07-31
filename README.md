# Gas Balloon Landing Predictor (GBLP)

A single-page web app for long-distance gas balloon flights. It helps plan a safe descent and landing area — including at night or above a closed cloud layer — based on current position, live wind forecasts, and configurable descent parameters.

**Current version: v88** (31.07.2026) — this number always matches the `APP_VERSION` constant near the top of the script in `index.html` and the version chip shown in the app's header.

No installation needed: open `index.html` in a browser (works as a home-screen PWA on iPad/iPhone via "Add to Home Screen"). No backend or server of any kind — everything runs entirely in the browser, using free public APIs (Open-Meteo for weather, OpenStreetMap/Overpass for map data, openAIP for airspace, Nominatim for place names).

---

## The two main functions

The map has a mode toggle (top-left, below any warning banners) that switches between:

### 1. Landing Area (default, always live)
Continuously projects where the balloon would land if descent were initiated now, using the current position, course/speed, and the descent parameters below. Shows:
- The projected flight path (teal cruise segment → yellow descent segment)
- A Monte-Carlo-based landing area (accounts for forecast uncertainty, scaled by how old the weather model run is)
- Ground wind at the landing site, with a trend arrow

### 2. Plan Descent
Now has two subfunctions, switchable via a small toggle that appears directly below the main mode toggle:

**Quick Descent** (the existing behavior): tap anywhere on the map to set an "Intended Landing Point" (red crosshair). The app searches for the descent-initiation time that lands closest to that point, using the forecast wind for the actual arrival hour. Two real bugs fixed this round: the cruise-phase blend from observed heading to forecast wind now completes within ~3 minutes (was up to 40) so the whole search is governed by one consistent rule instead of switching behavior partway through - this was the root cause of two nearby target clicks along the same obvious wind line landing on unrelated results. The search's "extend beyond the normal range" fallback was also made to trigger whenever the best result sits at the search boundary, not only when it still looks like a poor match.

**Staged Descent** (new): drag an orange marker along the reference trajectory (the cyan dashed line, now much more prominent) to choose a starting point/time. The app then computes - via randomized search over how the total time budget gets split between altitude "plateaus" spaced at least the configured minimum apart (Settings, default 300m/~1000ft) - the full envelope of landing points reachable through any combination of staged descents (linger at a plateau, drop to the next, repeat), shown as an orange reachable-area polygon. Two new sliders (shown while this subfunction is active) configure the total time budget (15min-3h, default 1h) and the descent rate used between plateaus (0.5-4.0 m/s, default 1.5 m/s). Clicking a point inside the reachable area searches for the specific stage-duration combination that lands closest to it, then draws that path and opens a panel (stage altitudes, durations, directions, speeds - as both a table and a simple altitude-vs-time graph).

**Staged Descent's reachable area** is now computed via deterministic "extreme strategies" (concentrate all available time on one stage at a time, plus pairwise combinations) rather than random sampling - uniform random time-splits statistically cluster toward the middle of the possible outcomes, which is the wrong tool for tracing a boundary. This is also noticeably faster (no repeated random trials needed). Stage altitudes are chosen based on real wind shear (direction/speed changes) rather than even spacing - by default only the 2 most worthwhile intermediate levels are used (configurable in Settings, along with the minimum separation), matching the practical rule that stopping at a plateau only pays for the ballast it costs if the wind there genuinely differs. Wind forecast uncertainty (growing with both the model's age and how far into the future each stage lies) also widens the reachable area, the same underlying idea as the probability cone in Quick Descent.

Clicking a point inside the reachable area now also runs a Monte-Carlo pass (forecast wind uncertainty) around the found stage plan, giving a probable landing area (green) alongside the reachable-area boundary (orange) and a clear violet descent-point marker - the same visual language as Quick Descent. Everything computed here (reachable area, descent path, landing area, descent point) now stays visible on the map when switching back to Landing Area or between subfunctions, and a small orange "Staged Plan" button (top-left of the map) reopens the stage table/graph panel at any time, in either main function.

**Real wind-timing bug fixed**: the staged descent's simulated path was using a single fixed forecast hour for the ENTIRE path (even portions occurring hours later), rather than the forecast for the hour each specific point actually occurs at. Now uses dynamically-updating wind throughout - the one exception is which altitudes get selected as worthwhile stages in the first place, which still (correctly, per the original request) uses a single snapshot of the forecast for when the draggable marker's position is reached.

**Real overlap risk fixed**: the staged-descent panel/reopen-button had a fixed pixel position that could collide with the warning/mode-toggle stack above them if several warnings were shown at once - now positioned dynamically based on what's actually rendered there. Removed a chunk of now-dead CSS (unused reopen-icon styling from an earlier round).

**Staged Descent Plan graphic redesigned**: proportional staircase (vertical drop scaled to altitude lost, horizontal length scaled to dwell time), altitude labelled on the y-axis (AMSL + AGL together, once per distinct level), a minute-scale time axis at the bottom, and a small rotated wind arrow + speed at each stage. The intercept level is colour-distinguished throughout, and the panel is now wide enough (420px) for this to stay legible. The panel-opening button was also moved from a floating map overlay into the header (next to the warning/legend icons), since the floating version could sit on top of the current-position marker.

**Staged Descent reliability fixes**: found a real race condition - clicking inside the reachable area used to check a debounced (400ms) background computation that could still be stale or not yet finished, which is exactly why the landing area "sometimes" seemed to work. Clicking now forces a fresh computation first. The landing area is also now guaranteed (by construction) to include the clicked point, and the drawn descent path is extended with a final short segment to the target if the search's own convergence still fell a little short - the search itself was also substantially strengthened (extreme-strategy seeding, two-phase refinement) so this is now rarely needed.

**Real drag bug fixed**: the staged-descent marker stopped responding to drags after the first one - calling `setLatLng()` on every 'drag' event (to snap to the trajectory) confuses Leaflet's internal drag state machine. Snapping now only happens on 'dragend'.

**Staged descent graphic redesigned again**: narrower (350px panel, compressed staircase icon), y-axis altitude labels bigger with "m AMSL"/"m AGL" units shown, "Intercept" tagged right next to its height instead of a separate label, wind shown as a single line (arrow + direction + speed, Ground-Wind style) in a dedicated info column so it never overlaps the curve, a rough "est. braking ballast" per stage (∝ descent rate², not independently calibrated), the curve itself thinner/lower-opacity, and the table removed (redundant with the graphic now).

Changing the inter-stage rate, max time budget, stage count, min separation, intercept height, or post-intercept rate now re-runs the search and redraws the plan for whichever target point is currently selected, instead of only updating the orange reachable area.

**Braking ballast estimate now uses real physics** instead of a rough placeholder constant: `ballast_kg = 0.5 × Cw × cross-section area × air density(altitude) × rate² / g`, with Cw=0.8 (the practical mid-range for envelope + basket/net/rigging drag together, per gas balloon flight theory - a pure sphere alone is closer to 0.4-0.5).

**Defaults on load**: Function 1 (Landing Area) active, sidebar open, map zoom set to roughly a 5km scale (was ~20-40km), Wind Animation AND the experimental Region Names layer both on by default.

A small "Clear staged descent area" button now appears next to the main Landing Area/Plan Descent toggle when switching back to Landing Area, if staged-descent results are still on the map - it disappears once clicked (or once cleared any other way).

**Real bug found: the marker became undraggable after selecting a target** because a second marker (the violet descent-point triangle) got placed at the EXACT same spot as the orange draggable marker and sat on top of it, catching the pointer events meant for the marker underneath. It and the other staged-descent overlay layers (descent path, landing area) are now all `interactive:false`, so they never intercept clicks/drags.

**Removed the artificial "snap to target" line segment** added in a previous round - it drew a straight line from wherever the physics-based search actually landed to the clicked target, which could point in a completely different direction than the real wind and looked exactly like the reported "against the wind" / "180° hook" segments. The path now always shows the real, physically-simulated result; the landing area is still guaranteed to contain the target regardless (via an explicit hull point).

Graphic redesigned again: shifted right (more left margin so the AMSL numbers aren't clipped), AMSL values normal-weight with a smaller "m AMSL" suffix, duration and wind readout moved above the gridline in a column right of the small staircase icon (never over the curve), braking ballast shown as a small grey right-aligned box at the chart's right edge, and "Ground" as a small outlined label sitting directly on its line (no redundant 0m AGL value there).

**"Clear results" now actually clears everything** including the reachable area itself - it was silently recomputing the area right after removing it.

**Search algorithm replaced with systematic coordinate descent** instead of random sampling - the random approach could get stuck well short of (or to one side of) the actual target in the multi-dimensional stage-allocation space, which is exactly why the landing area sometimes didn't surround the clicked point and the path didn't reach it.

**The draggable marker's hit area was enlarged** (16px → 34px) - a likely cause of it becoming hard to grab, especially on touch, was reported after the previous round's fixes.

Graphic redesigned again per detailed feedback: all stages now show duration+wind consistently (not just intercept), "Ground" sits on the y-axis without a box (green, thicker line), the shaded band between intercept and ground marks the final fixed-rate segment, the descent line itself is now grey, ballast is computed for the intercept→ground segment too with a running total shown under the title, and AGL is only shown at the start/intercept levels (intermediate stages show AMSL only).

**Overpass/vector layer data is now pre-warmed** alongside the regular tile pre-caching (nature reserves, non-landable terrain, region names, place labels) - the data quietly loads into memory for whatever's currently in view, so turning a layer on for the first time doesn't need to wait for a fresh fetch, without touching the map or the layer's loading dot until you actually enable it.

Twilight icons redesigned again (bigger, bolder, a classic sun-at-the-horizon pictogram) and the "Enable Manual Mode" button text is no longer bold.

**Real bugs fixed this round:**
- **SondeHub click was using the wrong endpoint** (`/sondes/{serial}` isn't a real route - the correct one is `/sondes/telemetry?serial=X&duration=Y`, with a differently-structured nested response). Fixed.
- **METAR staying stuck on yellow**: reduced the request limit back to MetarCentral's own documented example value (an undocumented cap above that may have been returning an error response without CORS headers, indistinguishable from a real CORS block) and made coordinate-field extraction more robust.
- **Precipitation tile-like artifacts appearing/disappearing**: a real race condition - overlapping requests (a slower older one finishing after a newer one) could briefly draw stale rectangles for an outdated map position. Both the rain and METAR layers now use a generation counter to discard out-of-order responses.
- **Staged Descent's Monte-Carlo area/path still not reliably matching the clicked point**: rebuilt the search from scratch as an exhaustive deterministic grid search over the simplex of possible stage time-allocations (rather than random/heuristic search, which could get stuck away from the true optimum) - and, critically, the reachable-area polygon and the specific-point search now share the *exact same* underlying grid, so they can no longer disagree about what's actually reachable.
- **Quick Descent's own map layers now hide while Staged Descent is active**, and reappear (only the ones that were actually shown) when switching back.
- Intercept now always includes a mandatory minimum 5-minute stabilization time in the model itself - a real gas balloon can't glide straight through intercept to the ground.

Twilight icons and the METAR layer's header icon redesigned again (smaller, filled, closer to a reference icon provided). Staged Descent graphic: zero-duration intermediate stages are no longer shown, no duration shown on the starting level (that's where the descent begins, not a stop), the configured descent rate is now shown below the start level, "Intercept" no longer pushes the AMSL value off the left edge, ballast total sits on the same line as total time, per-stage ballast is now whole kg, and the ground line/label is a darker, more prominent green.

The last two Staged Descent graphic items are now also in: any transition segment spanning more than 1000m of altitude gets an intermediate wind readout at its midpoint (rounded to the nearest 50m), with a thin dotted line into the axis showing that altitude; and inversions/isothermal layers/wind shear along the descent are now shown as thin coloured bands (green/blue/red) with their altitude (AMSL, plus AGL once below intercept), together with a small legend at the bottom of the chart showing only whichever of those three actually occurred on this particular descent.

Switching back to Landing Area leaves the last planned area visible on the map (with a delete button) until you plan a new one or clear it.

---

## Map layers (header icons)

Each toggle button shows a small traffic-light dot: invisible when off, yellow while loading, green once ready.

| Icon | Layer | Source |
|---|---|---|
| ⚡ | Power lines | OpenInfraMap vector tiles |
| 🛣️ | Roads + place names | Esri roads / Overpass (bounded to ~35-40km around map center to stay fast) |
| ✈️ | Airspace (raster) | openAIP tiles |
| 🌬 | Ground wind particles | Computed from the loaded weather model |
| 🌳 | Nature reserves & protected areas | Overpass (red hatched outline) |
| ⛰ | Non-landable terrain (17 categories, selectable in Settings) | Overpass (violet-red hatched) |
| Aa | Region/cultural place names (experimental) | Overpass (`place=region`, blue italic labels) |
| 🎈 | Live radiosondes (experimental) | SondeHub v2 - click a sonde to load its derived wind profile as the active sounding |
| 🛰 | Weather stations / METAR | MetarCentral - colour-coded by flight category (VFR/MVFR/IFR/LIFR), CORS confirmed working via a live test from the deployed app |
| 🌧 | Precipitation | Open-Meteo 15-minute forecast grid (6x6 across the viewport), colour-coded by mm/h - a model-based approximation rather than real radar, since it reuses the weather source already integrated in the app instead of adding RainViewer.com as a separate dependency |

Base map: Streets / Terrain / Satellite (top-right Leaflet control). Default on first load: Streets + ground wind particles only.

## Sidebar

- **Current Position** — live GPS fix, or manual entry in Test Mode
- **Projected/Planned Landing Area** — see above; title turns "PLANNED" (red) only while planning
- **Descent Parameters** — initiation delay, descent rate (with live adiabatic-braking readout), intercept height, post-intercept rate, Monte-Carlo scatter (default 15%)
- **Flight Charts** (collapsed by default) — Wind Profile and Hodograph, both reflecting the planned descent point's location/time while planning

## Test / Manual Mode

If GPS drops out, a banner offers to enable Manual Mode (tap position manually, or type exact Alt/Course/Speed). When GPS comes back, the same banner asks whether to leave Manual Mode again, rather than silently switching back.

## Emergency contact

The red warning-triangle button (left of Test Mode) prepares a position report for WhatsApp/SMS (up to 5 recipients)/Email. All contact details (pilot name, aircraft registration, mobile + second/SatPhone number, email, SMS recipients) are configured once in Settings and stored only on this device. **Important:** this is a static page with no server — it cannot send anything silently in the background. Each channel opens the corresponding app (wa.me / sms: / mailto:) with the message pre-filled; you still tap "send" yourself. Every attempt is logged in the Flight Log.

## Adiabatic braking model

Gas compressed adiabatically during a fast descent stays warmer (and less dense) than it would in slow thermal equilibrium with the surrounding air, giving extra buoyancy — a real, physically-understood effect that increases with descent rate (faster descent → less time for heat to escape → more retained warmth), saturating toward a fully-adiabatic maximum. This extra buoyancy is mathematically equivalent to having dropped that many kg of ballast, so it's expressed as a fraction of the balloon's total system mass (configurable in Settings, alongside gas volume) — a heavier system is proportionally less affected by the same absolute ballast-equivalent. The "Empirical variance factor" setting lets you scale the whole effect to match your own logged flights.

## Known limitations & approximations

- **No backend of any kind.** Emergency messages, CSV/Dropbox uploads, etc. are all client-side only — see the Emergency Contact section above.
- **Free public APIs**, not guaranteed uptime or rate limits. Overpass-based layers (nature reserves, place names) retry automatically with a cooldown and mirror rotation if the primary server is overloaded.
- **openAIP's Core API is CORS-blocked** for browser requests — real per-class airspace filtering and automated airspace-crossing warnings aren't possible from this page; only the combined raster tile overlay is shown.
- **Satellite count isn't available.** The standard browser Geolocation API only exposes latitude/longitude/altitude/accuracy/heading/speed — not satellite count, which requires native GPS-chip access no web page has.
- **In-page screen recording doesn't work on iPhone/iPad.** iOS Safari has no Screen Capture API at all (an Apple/WebKit platform limitation) — the recording button detects this and points to iOS's own Control Center recording instead. On desktop browsers that do support it, the button pulses red with a stop icon while recording.
- **A dashed ring shows the pre-cached tile area's boundary** once zoomed out far enough for it to be a useful reference; the area outside it greys out. Re-caching is checked at load and every 10 minutes, but only actually re-downloads once the balloon has moved at least 20% of the cache radius (min. 5km) from where it was last cached - not on every tiny movement.
- **A single, consolidated warning-triangle indicator** (header, right of GPS status) reopens every currently-dismissed-but-still-active warning at once - each individual banner's own reopen icon was removed to avoid clutter/collisions.
- **Language setting** (Settings, below Altitude Unit): English/Deutsch. Translates the main card titles and field labels; not yet a full translation of every message and tooltip in the app.
- **Real physics bug fixed in the adiabatic braking model**: the convective heat-transfer coefficient didn't scale with the envelope's actual size - for a real gas balloon (~12-13m diameter), the physically correct value is 5-10x smaller than what was used, meaning heat was escaping far faster than it really would. Fixed with a proper size-scaled correlation; the retained lift bonus is now 3-5x larger. The remaining percentage (relative to total system mass) is inherent to the model - entering your actual, typically lighter, system mass in Settings will show a proportionally larger effect.
- **Particle-slider drag reliability improved**: repeated `getBoundingClientRect()` reads on every pointermove (a known cause of dropped touch input on iOS Safari) were reduced to one cached read per drag gesture. The wind preview box now appears exactly at the thumb's height and is noticeably more transparent.
- **Legend reopen icons removed** from the map (were colliding with the mode toggle) - replaced with a single blue info-icon in the header (next to the warning triangle) that reopens all dismissed legends at once.
- **Map scale bar restyled** as a classic black/white segmented ruler, combined with the distance and the rounded 1:N ratio on one line, and now docks directly above whatever legend bars are currently open instead of a fixed position.
- **Small app logo** (balloon + dashed descent path + landing target) replaces the "GBLP" text in the header; the version number stays in the same place underneath it. See `logo_options.html` for alternative designs if you'd prefer a different one.
- **Ground wind particles now show REGIONAL variation**: a 3x3 wind grid is fetched across the visible map area (one combined request) and each particle interpolates its own local wind vector (both speed/color and movement) instead of every particle everywhere sharing one single value.
- **Legend "reopen" icon fixed to a blue circle** matching the warning triangle's size; scale bar redesigned as a labelled ruler (0 and the full distance marked at each end, so it's unambiguous the WHOLE bar represents that distance, not each striped segment) and repositions to sit directly above whatever legends are open.
- **Wind-preview popup on the particle slider**: fixed a real positioning bug (`top`/`right` were computed relative to the viewport, but the element's actual positioned ancestor is `#mapwrap`, which doesn't start at the viewport's top-left) - it now aligns exactly with the thumb, with a small pointer tail toward it, and a properly transparent background matching the slider container.
- **Adiabatic braking**: verified the barometric formula, Poisson's adiabatic law, and the (already size-corrected) convective heat-transfer correlation are each individually correct. The remaining modest percentage is structural (dividing the ballast-equivalent by total system mass) rather than a further identified bug - see the chat for the full reasoning and a request for real flight data to calibrate against.
- **Flight Charts is hidden by default** entirely (not just collapsed) - a header toggle (left of Day/Night) shows/hides it.
- **Plan Descent shows a 360-minute reference trajectory** at the current cruise altitude (light grey dashed) - purely informational, to help judge which areas are reachable before committing to a target point.
- **A custom scale bar** (km and nautical miles) sits left of the zoom buttons.
- **Wind shear detection** added to the Inversions box (now titled "Inversions, Isothermal Layers, Wind Shear") - flags large speed (≥5m/s) or direction (≥30°) changes between adjacent levels below the current altitude, shown in red.
- **Twilight/sunrise-sunset box** next to the GPS status (NOAA solar-position approximation): shows the next two upcoming events at the current position - SS/ECT during the day, BCT/SR at night, all in UTC.
- **Track playback** added to the Flight Log menu: draws the logged track and animates a marker along it over a fixed 20-second playback.
- **Info icon** is now an outline (not filled).
- **All warning banner texts start with ⚠**.
- **Ground wind legend fixed**: it was only ever showing ONE bucket (based on a single "representative" wind value), even though particles now have regionally-varying colors since the wind-grid change - it now shows every swatch actually present among the current particles.
- **Scale bar's first-segment label** now sits centered under that segment specifically (was at the segment boundary before).
- **All warning close (✕) buttons** now consistently white, matching the legend bars' close button (previously inherited each banner's own text color, which varied).
- **Non-landable terrain layer redesigned**: new icon (hatched square, clearly distinct from the nature-reserves tree icon), expanded from 5 to 17 individually selectable OpenStreetMap categories (forest, scrub/heath, water, wetland, vineyard, orchard, farmland, meadow, residential, commercial/retail, industrial, quarry/landfill, cemetery, bare rock/scree, cliff, sand/beach/mud, glacier).
- **Experimental region/cultural-name layer added** (`place=region` in OpenStreetMap) - shows a dismissible blue banner when enabled, since this tag was never formally standardized and coverage varies drastically by area (good in some regions like the French Alps, sparse or absent elsewhere).
- **Removed a completely CORS-blocked Overpass mirror** (confirmed via console: it can never work from a browser, full stop) and replaced it with an official alternate subdomain of the main Overpass project.
- **Warning banners' close (✕) buttons now sit on the left.** Dismissing one while its underlying condition is still active shows a red warning-triangle indicator next to the GPS status in the header - tap it to bring back every currently-dismissed-but-still-active warning at once.
- **If a newly-generated version doesn't seem to show up**: this is a static file with no server of its own - after downloading it, it must actually be re-uploaded/committed to wherever it's hosted (e.g. the GitHub Pages repository) before the live site reflects it, and the browser/PWA may also be showing a cached copy of the page itself (try a hard reload, or fully close and reopen the app if it's installed to the home screen).
- **Adiabatic braking and Monte-Carlo scatter are approximations**, not calibrated against real flight data — treat as a planning aid, not a certified instrument.
- **Cloud file pickers** (Dropbox, Google Drive, etc.) shown when uploading a file are controlled entirely by iOS/the browser, based on which provider apps are installed — not something this page can add to or configure.
