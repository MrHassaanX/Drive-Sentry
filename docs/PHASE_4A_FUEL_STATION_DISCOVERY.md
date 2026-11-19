# Phase 4A · Nearby fuel stations

Open **Fuel → Find Nearby Petrol Pumps** with or without a selected vehicle. Use foreground device location or select **Mysuru, Karnataka** as a manual demo. The 3, 5 and 10 km selectors filter mapped stations by straight-line Haversine distance. Directions pass station coordinates to Google Maps or its browser URL.

The route delegates to the station finder, the search module owns SQLite cache access, and the Overpass adapter fetches and validates OpenStreetMap nodes, ways and relations tagged `amenity=fuel`. It keeps distinct OSM identities and removes repeat occurrences of the same identity. Ways and relations use the provider's approximate feature centre. Station metadata is community-contributed and can be missing or out of date. Fuel tags cannot establish current stock. [OpenStreetMap copyright and ODbL](https://www.openstreetmap.org/copyright)

The app requests foreground permission only when **Use current location** is selected. A recent fix can be reused for up to one minute when accurate within 250 m. Precise device coordinates stay in screen memory. Queries and cache keys use coordinates rounded to two decimal places. The query radius includes an 800 m margin for rounding and the phone filters against the actual selected centre.

Migration 5 adds a disposable cache and preserves garage data. The cache retains the latest 20 area/radius results, including successful empty searches. Results are fresh for 24 hours. Refresh bypasses freshness, and a failed network request can show timestamped saved results for the same area and radius with a stale label.

The app sends a form-encoded POST with the Overpass QL in the `data` field and identifies DriveSentry in its user agent. It tries FOSSGIS Overpass and then Private.coffee on failure, with at most one attempt per provider and one active search. Each attempt has a 12-second query budget and an 18-second client deadline. A failed provider cools down for 30 seconds, or at least 60 seconds after a rejection or rate limit. The app honours a longer Retry-After header. A deployment can set `EXPO_PUBLIC_OVERPASS_URL` to use a single compatible endpoint. Successful cache entries retain the serving provider and retrieval timestamp. Older entries still load with OpenStreetMap attribution. [FOSSGIS usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) · [Private.coffee terms and privacy policy](https://overpass.private.coffee/)

## Verification

The initial Android run opened the finder from an empty garage and exercised foreground denial and grant, simulated Mysuru GPS, all five tabs and both themes.

On 19 November 2026, both Overpass hostnames resolved and completed HTTPS handshakes from Windows. FOSSGIS returned HTTP 406 on its status endpoint, and a tiny valid GET returned HTTP 502 with a plain-text capacity message explaining that its workers and request queue were full. The observed 406 supplied no evidence of quota exhaustion. The tiny POST to FOSSGIS timed out without an HTTP response. Private.coffee timed out on its status endpoint, the tiny GET and POST, and a Mysuru POST. These failures occurred independently of the Android app and did not produce valid station responses.

The Android repair run used the public endpoints with the manual Mysuru demo. The 3 km request received FOSSGIS HTTP 502 and a Private.coffee timeout. The 10 km request received FOSSGIS HTTP 502 while Private.coffee was cooling down. The first 5 km selection confirmed that both cooling-down endpoints were skipped. A fresh 5 km search after cooldown timed out on both endpoints.

Automated tests verify form encoding, bounded fallback, HTTP status and timeout handling, incomplete-response rejection, and restoration of a cached result with its source and original timestamp when refresh fails. Live result ordering, names, directions and offline recovery from a real response remain blocked because the emulator obtained no successful payload. iOS runtime remains untested.

Phase 4B city fuel prices and Phase 4C premium/E0 discovery remain unimplemented. Follow-up verification should use a reachable Overpass instance and check the result list, directions handoff and offline cache on Android and iOS.
