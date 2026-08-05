# Gasballoon Cockpit

A single-page web app for long-distance gas balloon flights. It helps plan a safe descent and landing area — including at night or above a closed cloud layer — based on current position, live wind forecasts, and configurable descent parameters.

**Current version: v1.06.01** (05.08.2026) — this number always matches the `APP_VERSION` constant near the top of the script in `index.html`. Versioning scheme changed to `v1.0X.YY` (X = working day, YY = iteration within that day). The version chip itself lives at the bottom-left of the map now, next to the Leaflet/OSM attribution.

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

**METAR staying stuck yellow - real cause found**: MetarCentral's own documentation caps anonymous (no API key) requests at 10 results, but the request was asking for 50, likely getting rejected outright. Reduced to 10.

**Sonde data not affecting function 2 - real cause found**: the reference trajectory (and the staged-descent reachable area) were only ever computed once, right when Plan Descent was first opened - switching sounding sources afterwards never refreshed them. Both now recompute alongside function 1's own live area on every relevant change.

Rain layer's minimum precipitation threshold raised, since very light/noisy model values below any real significance were what looked like "random tiles."

MetarCentral API key support added (Settings, below the layer sections) - raises the result limit from 10 to 500 per request and the daily quota from 100 to 1000. As with any client-side app, a filled-in key is visible in the page source to anyone who views it.

**METAR key was actually breaking the layer entirely** - sending it as an `X-API-Key` header triggers a CORS preflight request that MetarCentral's server doesn't allow that header on, rejecting every request outright (confirmed directly from your console output). Switched to the query-parameter authentication option instead, which doesn't trigger a preflight.

**Real bug found: the staged descent panel could stay invisible even after a successful computation** - the panel's `display:block` was set only AFTER drawing the (fairly complex) chart, so any exception in that drawing code silently prevented the panel from ever showing. The panel now becomes visible first, and the whole function is wrapped defensively so a display bug can no longer hide the entire result.

Staged descent placement changed: the orange marker no longer starts pre-placed - it only appears once you tap the map within ±40° of the reference trajectory's own direction (with a brief on-map hint otherwise), snapping to the nearest point on that trajectory. Tapping outside the reachable area now also shows a brief hint instead of doing nothing. Once a plan is computed, the red target marker fades out after ~1s, leaving the black landing-center marker as the lasting reference. "Clear results" now also resets the placement itself, back to tap-to-place.

Silent background emergency email via EmailJS added (Settings, optional) - a real no-app-switch send when configured, with the existing mailto: flow as a fallback.

Target/landing marker icon simplified (a filled ring instead of a full crosshair), the descent-initiation triangle in function 1 now rotates to sit perpendicular to the trajectory at its position, and the projected-trajectory colour is now the same green in both function 2 subfunctions.

METAR fetch now logs the full raw response shape to the console for easier diagnosis if it's still not showing stations.

Header decluttered for iPad: GPS shows just a colour-coded dot (red/yellow/green by fix accuracy) plus the accuracy figure, "Model" label removed and its text shrunk, twilight times no longer wrap and UTC is smaller, Day/Night + Capture + Settings + Test Mode are now behind a single "☰ More" dropdown, and the version/date moved from the header down to a small badge at the map's bottom-left corner (matching the Leaflet attribution box's own styling).

Header decluttered for iPad: GPS indicator is now a compact 3-colour dot (red/yellow/green by fix accuracy) with just the accuracy figure next to it, the weather model chip dropped its "Model" label, twilight times no longer wrap, and Day/Night, Capture, Settings, and Test Mode all live in a single "More" (hamburger) dropdown. The Wicki Partners Ballonteam logo now sits small in the top-right.

Favicon changed to a light target/crosshair symbol.

**Real bug found: the hamburger menu never actually toggled** - its inline style set `display` twice (`none` then `flex`), so the second declaration silently won and the menu was effectively stuck open/inconsistent from the start regardless of clicks. Fixed.

Header restructured further: old logo + separator removed from the top-left, replaced by the hamburger button there (borderless); GPS is now a colour-changing pin icon (red/yellow/green) instead of a small dot; twilight times are bottom-aligned with their SR/SS/etc. label; the blue "reopen legends" info icon no longer relies on a Unicode glyph that iOS renders as its own coloured icon on top of the button's border (a real rendering collision) - it's a plain drawn SVG now; Flight Log moved into the hamburger menu; the Wicki Partners logo moved to the far right (bigger), with the emergency button just to its left.

Layer buttons reordered (wind, sondes, weather stations, rain, then roads, protected areas, terrain, then airspace) and lightly tinted by category (blue for weather/sonde/rain layers, green for roads/terrain/protected areas, yellow for airspace) so related layers read as a group at a glance.

Weather model display redesigned to two compact lines (cloud icon + short model name, then a small download-arrow + fetch age and clock + run age below), and the verbose "fetched X ago · run ~Y h old" text is gone entirely. Twilight rows switched to a single flex line each (icon, SR/SS label, time, UTC all with `flex-shrink:0`) so they can no longer wrap, bottom-aligned, with smaller SR/SS/BCT/ECT labels and a more compact but still-visible UTC suffix. Layer buttons: the loading-state indicator moved from a floating corner dot to a thin strip along the bottom edge, and the buttons themselves are now smaller (28px vs 34px) with proportionally smaller icons.

Weather model name no longer shows the "· auto" suffix in the compact header display (still available as a tooltip). Twilight display switched to a proper CSS grid (icon/label/time/UTC columns) so times and the UTC suffix stay aligned in their own column regardless of whether the label above is "SS" or the wider "ECT" - and bottom-aligned per row as intended; icons enlarged again since the last size was too small to read. Layer button groups (weather/sonde/rain, roads/terrain/protected areas, airspace) now have a visible gap between them. Emergency button shrunk to match the more compact header sizing.

Emergency button is now round (distinguishes it more clearly from the square layer buttons). The legend-reopen icon switched from a plain "i" to a layer-stack icon (clearer that it's about map layer legends specifically). The warnings-reopen icon also switched from a raw "⚠" Unicode character to a hand-drawn SVG triangle - the same class of rendering collision found earlier with the info icon (iOS substituting its own coloured glyph) was possible here too, now avoided the same way.

**Twilight icon bottom-alignment - actual root cause found**: the SVG's own viewBox had a lot of empty space below the visible horizon line (viewBox went to y=24, the horizon line was at y=15.5), so even with the grid correctly bottom-aligning the icon's box, the visible artwork inside it still sat noticeably higher than the text baseline next to it. Cropped the viewBox tightly to the actual artwork, which is the real fix (the grid `align-items:end` alone couldn't fix this, since it only aligns boxes, not the visual content within them).

Layer button groups redefined and re-coloured: weather (blue) = wind, weather stations, sondes, rain; ground cover (green) = power lines, roads, protected areas, terrain, region names; airspace (red) = airspace alone. Power lines and region names had previously been left outside any group/colour.

Version badge's z-index raised further (defensive - couldn't find a code-level reason it would be hidden, see chat about checking for a stale cached page instead).

Layer buttons regrouped into three "pill" containers (one shared background per category) instead of colouring each button individually - the individual-icon tinting apparently wasn't showing clearly enough in practice. Version badge also given its own explicit background/padding instead of depending on Leaflet's `.leaflet-control-attribution` styling being available, in case that was the actual cause of it not appearing.

**Real bug found: the hamburger menu really was rendering behind the map** - `#topbar` has `overflow-y:hidden` (for the horizontal-scroll behaviour when the header gets crowded), which clips any `position:absolute` child that tries to extend below the header's own box, exactly what a dropdown does. Every other popover (Settings, Capture, Emergency) uses `position:fixed` instead, which escapes that clipping - the hamburger menu now does too, with its position computed from the button's location when it opens.

**Real collision found: the version badge and the bottom-stacked legends really did overlap** - legends stack starting 8px from the bottom and span the full width, the version badge sits at 2px from the bottom-left - raised the legend stack's starting position to clear it.

Pill group borders thickened and made more saturated (was too subtle to read as a border). More space added to the right of the airspace pill (its vertical divider removed, replaced by margin instead), and the whole button row nudged left slightly.

Legend-reopen icon changed once more to an eye symbol - matches what the button actually does (bring back hidden legends) more directly than the previous layer-stack icon.

Warning/eye icon borders thinned (2px to 1.5px) and slightly less opaque for a more elegant look.

Flight Charts moved into the "More" menu too (alongside Day/Night, Capture, Settings, Flight Log, Test Mode), and the whole menu redesigned as uniform icon+label rows with subtle divider lines instead of each item being its own bordered box.

**Real bug fixed: layer button outlines were fully transparent** regardless of on/off state - now always visible (subtle when off, thicker in the category colour when on).

**Real bug fixed: Settings/Capture/Flight Log panels opened at an inconsistent position** - they positioned themselves relative to whichever button was clicked, but those buttons now live at varying heights inside the "More" menu. They're now anchored to the "More" menu itself (to its right, top-aligned) instead. Flight Charts is unaffected (unchanged, fixed position at the bottom of the right column).

Added a close (✕) button to the "More" menu.

**Real bug fixed: METAR never retried after a failed request** - it just stayed yellow indefinitely until a manual pan/zoom/toggle. It now retries automatically every 8s, same as the Overpass-based layers already did.

All four map-data layers (METAR, nature reserves, land cover, region names) now show a red "repeatedly failing" state after 3 consecutive failed attempts, instead of staying yellow ("still loading") forever - a more honest signal when the underlying service is having trouble. Regarding nature reserves/land cover/region names specifically: the public Overpass API infrastructure has well-documented, ongoing reliability issues completely independent of this app (confirmed via OpenStreetMap community discussions) - our own request throttling/multi-mirror fallback was already reasonably solid, but can't fully compensate for that.

Layer buttons inside each pill are now fully transparent (no background of their own) - only the pill carries colour, so the icon and its on/off border read more clearly instead of competing with a separate box behind it.

New layer: **Air traffic** (red pill, next to Airspace) - live aircraft positions via ADSBExchange's RapidAPI subscription (Settings: your own RapidAPI key, plus an altitude band below/above the balloon's current altitude to filter what's shown). Requires a paid RapidAPI subscription to "ADSBexchange.com" - there's no free tier for this data source as of March 2025. The custom `X-RapidAPI-*` headers this needs could in principle trigger the same CORS-preflight issue MetarCentral's header-based auth once did - added to `cors_test.html` alongside a free alternative (adsb.fi, personal/non-commercial use, no subscription) for comparison, since that wasn't confirmed working yet either.

OGN/glidernet.org (FLARM/glider traffic) was researched but not implemented yet - its live-aircraft API endpoint isn't clearly documented publicly (the one example found returned ground station markers, not aircraft), so it needs proper verification before being built on, rather than guessing at undocumented parameters.

Corrected a transcription error in the RapidAPI key (a character was dropped when it was originally read from a screenshot) - fixed in both the app's Settings default and the `cors_test.html` test entry.

Layer buttons back to their own solid background (not transparent) - the pill-only colouring made icons hard to distinguish, since they visually blended into the pill's own tint instead of standing out in front of it.

Air Traffic simplified: only one setting now, a numeric altitude band (ft) above the balloon's current position (default 2000ft) - all traffic below is always shown regardless, since the balloon could descend into it. The layer button's hover text now reflects this value live ("Air Traffic below and 2000ft above position").

**METAR - the real, confirmed cause finally found**: a live browser CORS test proved MetarCentral's bulk endpoint (`/api/airports/metar-status`) is CORS-blocked, while its single-airport endpoint (`/api/weather/{icao}`) works fine - not a guess this time, an actual verified test result. The layer now queries a built-in list of ~50 major/regional European airports individually (nearest 15 to the current view), instead of the one bulk call that never worked. No API key needed for this anymore, so that Settings field was removed.

**Air Traffic confirmed working** via the same live test (HTTP 200 with real aircraft data through RapidAPI's gateway, custom headers included) - no changes needed there.

**Real bug fixed across every map-data layer: turning a layer off destroyed its cached data** (`clearLayers()` ran on every toggle-off), so turning it back on always meant a full fresh fetch and a yellow "loading" flash - even seconds later with the map untouched. Every layer (nature reserves, terrain, region names, place labels, sondes, METAR, air traffic, rain) now just hides on toggle-off and keeps its data; toggling back on shows the cached content immediately (green) while a background refresh runs, rather than clearing and reloading from scratch. The area pre-caching step also now silently warms up METAR, air traffic, rain, and sonde data too (previously only nature reserves/terrain/region names/place labels), so all eight layers are ready the first time they're switched on.

Airspace and Air Traffic icons redesigned - a stacked altitude-band symbol (zone, not object) for Airspace, and a radar sweep symbol for Air Traffic, since the two previously used near-identical plane silhouettes.

Aircraft markers on the map made much more prominent (26px, thicker white outline, dark halo for contrast against any map background - was easy to miss at 16px). Air Traffic's default altitude band changed to 6000ft above the balloon's current position.

**Settings substantially reorganized**: sections now follow the same left-to-right order the corresponding toggles appear in the header (weather group, then terrain/airspace group, then general settings, contact, and backup). Every API key/token in the app (RapidAPI, EmailJS's three credentials, the Dropbox app key) moved into one collapsed "API Keys & Tokens" section at the very bottom, and changing any of them now asks for confirmation first - cancelling reverts to the previous value rather than silently keeping a possibly-mistyped edit.

METAR and Air Traffic markers moved to their own explicit map panes (above the default marker pane) - couldn't find a code-level cause for METAR still not showing, so this rules out any z-index/stacking explanation definitively; also added much more detailed console logging (raw response of the first successful station, per-station failure reasons) for the next round of diagnosis if it's still not appearing.

**Sonde workflow rebuilt from the ground up**: no more native browser `alert()`/`confirm()` dialogs (which show the page's github.io origin in their title - the "GitHub messages" from your report). Tapping a sonde now opens the app's own modal, showing the vertical profile (a table of derived wind levels) and key data (launch time, last fix, position, point/level counts) first, with a proper close button - only once that's open can you choose "Use as trajectory source". Sparse telemetry no longer gets silently discarded: whatever's available is shown, with a short inline note if it's thin, instead of refusing to display anything below an arbitrary minimum.

Settings moved to the very bottom of the "More" menu, below Flight Log and Test Mode.

Pre-cache radius switched from a slider to a numeric input (km).

Air traffic markers overhauled: the grey halo circle is gone, the symbol itself is bigger/bolder, and it now shows a small grey FL + climb/descent-arrow readout to the right. Aircraft type is detected from the ADS-B emitter category (and, as a fallback, the type designator against a short list of common helicopter models) so helicopters and gliders get their own distinct symbol instead of every aircraft using the same fixed-wing silhouette.

METAR/weather stations rebuilt as an actual station-model symbol: a simplified wind barb (direction + rough speed), a sky-cover circle following the international clear/few/scattered/broken/overcast convention, and the temperature - all parsed directly out of the raw METAR text, since the API doesn't return these as separate fields. The flight-category colour ring is still there around the symbol. Tapping a station now opens a proper popup box with the colour-coded category and the full raw METAR text, instead of only a hover tooltip.

METAR markers redesigned again: the station-model graphic is gone, replaced with the international "airport" pictogram (a bold plane silhouette in a filled, white-bordered, flight-category-coloured circle - deliberately high-contrast so it reads clearly against any map background) plus an adjacent info box showing "ICAO wind" on one line and a CAVOK/visibility+cloud summary on the second. Hovering either shows the full raw METAR. TAF is NOT included - MetarCentral's own official API documentation (fetched directly) lists only four endpoints, none of them TAF, despite mentioning TAF as one of their underlying data sources elsewhere on the site.

Aircraft FL/rate readout box switched to a light background with a dark grey border, clearly distinct from METAR's dark info boxes.

**General weather stations added to the same layer as METAR**, closing the gap - MetarCentral only covers airports, so this uses Open-Meteo's current-conditions data (already used elsewhere in this app, confirmed CORS-open, no key needed) at a small 3×3 grid of points across the current view. Each shows the international station-model symbol (wind barb + sky-cover circle, in bold white for contrast against the map) plus temperature, and a hover tooltip with the full reading. Grid points that would land right on an already-shown airport are skipped to avoid duplicate symbols stacked on each other. This is model-derived (blended from real station/radar/satellite data, not read from one specific physical station), which is disclosed in the tooltip.

**Correction from the last version: the "general weather stations" were fabricated grid points, not real stations** - fixed by switching to actual, named MeteoSwiss SwissMetNet stations (100 of them, hardcoded with real codes/names/coordinates) via api.existenz.ch, an unofficial but CORS-confirmed wrapper around MeteoSwiss's own official open data. Shows real wind (direction+speed) and temperature per station, with the station's real name in the tooltip. Switzerland only for now - no verified source yet for other countries. The exact response format from this API wasn't confirmed ahead of time, so the parsing is defensive and logs the raw response for verification; also added to `cors_test.html` for the same reason.

Air Traffic icon changed to two crossing aircraft silhouettes (from left and right) - Airspace icon still pending a decision between three newly proposed alternatives (see chat).

Air Traffic icon replaced with an actual vectorised trace of the uploaded reference image (via OpenCV contour extraction, not a hand-drawn reinterpretation) - a single instance, not duplicated/crossed. Airspace icon still pending - the "crosshair/target" reference image you sent is a good candidate, awaiting confirmation before implementing.

Airspace icon finalised: crosshair/target circle (approved from the reference image sent). Both Airspace and Air Traffic icons are now settled.

**Real bug fixed: METAR could show green (ready) while displaying nothing at all** - the "success" state was set regardless of whether anything actually got added to the map. Now: if a fetch completes without errors but zero airports and zero stations end up shown, the button goes to the red "error" state instead of misleadingly green, with a specific console warning to help pin down whether it's genuinely nothing-in-view or a response-parsing mismatch.

**Real bug fixed in cors_test.html: a slow/hanging request (Overpass in particular) could block the entire test sequence indefinitely**, since there was no timeout - it looked like the tool "stopped after the first test" when it was actually just still waiting. Each test now aborts after 20s with a clear "timed out, not necessarily CORS" message, and the run loop has an extra safety net so nothing can halt the sequence early.

**Real bug found and fixed, confirmed via your live test: Swiss weather station parsing was reading the wrong response shape.** The actual response is `{"source":..., "payload":[{"loc":"BER","par":"tt","val":33.7}, ...]}` - a flat array of one reading per entry. The code checked `Array.isArray(wxResp)` first (false, since the top-level value is an object with a `payload` key, not an array itself) and fell through to a branch that treated the response's own top-level keys (`source`, `apiurl`, `payload` itself) as if they were station codes - producing nothing useful. Now reads `wxResp.payload` directly, matching the confirmed format exactly.

Also confirmed via the same test: MetarCentral's bulk endpoint is still CORS-blocked (as before) - unrelated to the app, which already switched to per-airport lookups a few versions back; RapidAPI/ADSBExchange and all the Overpass/Open-Meteo/Nominatim/SondeHub endpoints are all still working correctly.

Swiss weather stations redesigned: much bolder circular badge with a wind-direction arrow coloured on the exact same scale as the ground-wind particle layer, plus a full-message info box (station code, wind, temperature) matching METAR's approach - temperature de-prioritised to secondary/small text rather than the main readout.

Added 429 (rate-limit) detection for MetarCentral's per-airport requests, with a specific console warning - after many rounds of testing today, the anonymous daily quota may simply be exhausted, which would explain airports temporarily not showing while Swiss stations (a different, unrelated API) do.

**Rain layer rebuilt on RainViewer's free public radar tile API** instead of the coarse Open-Meteo grid-of-rectangles approximation - real radar imagery, no API key needed, tile-based (so no CORS risk the way a `fetch()`-based API would carry). Refreshes roughly every 10 minutes, matching how often RainViewer publishes new frames.

FLARM/FANET (glider/paraglider) data is confirmed NOT integrated into Air Traffic - this was explicitly deferred earlier since OGN's live-data API isn't clearly documented publicly, and building on unverified assumptions was the same trap that caused several of the METAR/weather-station issues above.

**App renamed to "Gasballoon Cockpit"** everywhere user-visible (title, header, GPX export metadata). Internal cache keys, localStorage keys, and the Dropbox folder name intentionally stay on their old "gblp" naming for data continuity, matching the same approach used for the earlier "GBLP → GB Landing Planner" rename.

OGN/FLARM researched again, properly this time: confirmed via a third-party developer's own documentation (LiveTraffic's docs) that OGN's live position data has no officially documented REST API - only raw APRS-IS streaming (unusable from browser JS) or the same undocumented `live.glidernet.org` endpoint found before, which that same third-party doc explicitly calls "not officially standardized, subject to change." Added it to `cors_test.html` anyway (marked ★, clearly labelled as unverified/unofficial) so it can be tested before any decision to build on it - not implemented into the app itself yet, pending that test.

`cors_test.html` also cleaned up: removed the MetarCentral bulk-endpoint tests (confirmed broken multiple times now, no further value in re-testing every round) and the SwissMetNet/ADSBExchange entries' "unverified" labels (both now confirmed working and in active use) - added a RainViewer metadata check for the new radar layer.

Spelling corrected to "Gasballoon Cockpit" (double-o) everywhere.

METAR: switched from firing all ~15 airport requests simultaneously to 3-at-a-time batches with a short pause between - a per-second rate limit (separate from any daily quota) could plausibly have been tripping on the burst of parallel requests.

Weather stations (both airports and Swiss SwissMetNet) now filtered by the same cache radius configured in Settings, centred on the balloon's actual position - not just whatever the map view happens to show, matching how every other pre-cached layer works.

The wind-particle legend now stays visible whenever either the particle layer or the weather-stations layer is active (since the station wind arrows use its exact colour scale), instead of disappearing the moment the particle layer itself is switched off.

**OGN/FLARM integrated into Air Traffic** - confirmed CORS-open via your test. Since the endpoint itself is undocumented, the field mapping was reconstructed from two independent official sources (the FLARM aircraft-category table published on OGN's own wiki, and column names visible in OGN's open-source `ogn-live` repository) and cross-checked against live sample data before use - gliders, helicopters, paragliders, and even other balloons now get their own distinct icon shape, separate from powered aircraft. Air Traffic no longer requires a RapidAPI key at all - OGN data shows regardless, ADS-B data is added on top if a key is configured. Every OGN-sourced marker's tooltip explicitly says "unofficial data source, field mapping best-effort," since a couple of live samples showed implausibly high speed/climb values that don't fully resolve without official documentation - shown as-is rather than silently filtered, so you can apply your own judgement.

Weather station markers merged into one icon (was two): a muted grey box (deliberately toned down, not a bold colour fill) containing the wind arrow at its original size - still coloured on the wind-particle scale - with direction/speed on one line and temperature/dewpoint/humidity smaller below. No station name in the box itself; the full reading appears on hover, with the network name (e.g. "MeteoSwiss SwissMetNet") last and in the smallest text, as the least important part. Dewpoint is calculated from temperature + humidity (Magnus-Tetens approximation), since SwissMetNet doesn't report it directly. Built as one shared function so any additional national network added later automatically follows the same display rules.

**Real bug fixed: aircraft/weather-station tooltips could render behind their own markers.** Both custom map panes were set to z-index 650 - exactly tied with Leaflet's own built-in tooltip pane - and being created later in the DOM meant they actually won that tie and rendered on top of tooltips despite the "equal" value. Lowered to 625, clearly below tooltips.

Aircraft tooltips redesigned: much smaller, all data on one wrapping line instead of stacked `<br>` lines, with the source ("via ADSBExchange" / "via OGN/FLARM") on its own even-smaller line below.

Air Traffic now refreshes on a 15s timer whenever the layer is on, not just when the map is panned or zoomed - aircraft move fast enough that a static snapshot looked wrong within seconds.

**New day, new version scheme count (day 6).**

METAR's airport symbol now rotates to point with the wind (same "blowing toward" convention as elsewhere in the app), and its info box is tinted blue instead of grey, so it's visually distinct from the general weather stations.

**Second national weather network added: Germany, via Bright Sky (api.brightsky.dev)** - an open-source, CORS-confirmed wrapper around DWD's official open data ("CORS requests are now allowed from all origins" per their own changelog). Unlike Switzerland, this doesn't need a fixed station list - `/current_weather?lat=..&lon=..` returns whichever real DWD station is nearest, with its real name, and includes dewpoint directly (no need to calculate it, unlike SwissMetNet). ~20 query points spread across Germany, weighted toward the south. Duplicate stations (multiple query points resolving to the same physical station) are filtered out before rendering.

Covering "as many European countries as possible" is a genuinely large undertaking - each country typically has its own separate national service with its own API. Switzerland and Germany are now in; further countries (France, Austria, Italy, UK, etc.) would each need the same kind of dedicated research before being added, rather than guessed at.

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
