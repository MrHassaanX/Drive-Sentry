# Phase 4A · Nearby fuel stations

Open **Fuel → Find Nearby Petrol Pumps** with or without a selected vehicle. Use foreground device location or select **Mysuru, Karnataka** as a manual demo. The 3, 5 and 10 km selectors filter mapped stations by straight-line Haversine distance. Directions pass station coordinates to Google Maps or its browser URL.

The route delegates to the station finder, the search module owns SQLite cache access, and the Overpass adapter fetches and validates OpenStreetMap nodes, ways and relations tagged `amenity=fuel`. It keeps distinct OSM identities and removes repeat occurrences of the same identity. Ways and relations use the provider's approximate feature centre. Station metadata is community-contributed and can be missing or out of date. Fuel tags cannot establish current stock. [OpenStreetMap copyright and ODbL](https://www.openstreetmap.org/copyright)

The app requests foreground permission only when **Use current location** is selected. A recent fix can be reused for up to one minute when accurate within 250 m. Precise device coordinates stay in screen memory. Queries and cache keys use coordinates rounded to two decimal places. The query radius includes an 800 m margin for rounding and the phone filters against the actual selected centre.

Migration 5 adds a disposable cache and preserves garage data. The cache retains the latest 20 area/radius results, including successful empty searches. Results are fresh for 24 hours. Refresh bypasses freshness, and a failed network request can show timestamped saved results for the same area and radius with a stale label.

The default endpoint is `https://overpass-api.de/api/interpreter`. An authorized deployment can select a compatible global instance via `EXPO_PUBLIC_OVERPASS_URL`. The client permits one request at a time, waits at least four seconds between starts and backs off for 60 seconds on HTTP 429 or 406. The client times out after 25 seconds and retries only on user action. Public Overpass availability varies and suits a small academic demo. [Overpass usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)

## Verification

The Android phone emulator opened the finder from an empty garage. Foreground denial, grant, a GPS timeout and a subsequent simulated Mysuru fix were observed. The manual Mysuru query at 3, 5 and 10 km reached the provider, which returned HTTP 406. Host checks also encountered HTTP 406, gateway timeout or a client timeout. Live station cards, directions and offline recovery from a live cache still need an end-to-end device check. Automated fixtures cover normalization, missing metadata, duplicates, distance and radius, cache selection, expiry and failing network requests. Migration tests cover older schemas and preservation of existing records. iOS runtime remains untested.

Phase 4B city fuel prices and Phase 4C premium/E0 discovery remain unimplemented. Follow-up verification should use a reachable Overpass instance and check the result list, directions handoff and offline cache on Android and iOS.
