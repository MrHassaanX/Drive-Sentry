# Phase 4A · Nearby Fuel Stations

Open **Fuel → Find Nearby Fuel Stations**. Choose **Use GPS** or **Mysuru demo**, then select 3, 5 or 10 km. The map pans and zooms without triggering requests. Use **My location** to recenter or **Fit stations** to show the returned markers. A marker opens a collapsible detail panel. **List** sorts the same results by approximate straight-line distance, and selecting a row returns to its marker. **Get Directions** passes coordinates to an external navigation app or browser.

## Configure the development key

1. Create or select a project in your own [Geoapify dashboard](https://myprojects.geoapify.com/) and obtain a development key authorized for Places. Apply appropriate quotas and restrictions for the demo.
2. Set `EXPO_PUBLIC_GEOAPIFY_API_KEY` in the workspace's gitignored `.env.local` file and restart Metro. Keep the key out of screenshots, logs, pull requests and commits.

```dotenv
EXPO_PUBLIC_GEOAPIFY_API_KEY=
```

Expo substitutes this value into the mobile bundle. Anyone who can inspect the bundle can extract it. Use a protected gateway or backend proxy with its own authentication, quotas and validation for production. Expo Go supplies the native maps runtime and Android basemap configuration. A standalone Android build also needs its own restricted Maps SDK for Android key configured through the maps config plugin. iOS uses the default Apple Maps renderer. [Expo SDK 58 map setup](https://docs.expo.dev/versions/v58.0.0/sdk/map-view/)

## Provider and storage

Geoapify Places queries `service.vehicle.fuel` with circle filtering and proximity bias. The adapter validates GeoJSON Point features and deduplicates by place ID. It reads the formatted address and any available brand, operator, hours or explicit fuel tags. Requests use at most two pages of 100 features, and the UI labels a result that reaches the cap. Requests time out after 16 seconds and honour cooldown after HTTP 429. Brand and fuel tags are community metadata. They cannot establish current stock or verified premium fuel grades. Future grade evidence can be attached separately to the normalized station ID with grade, source URL, verification date and last confirmed availability. [Geoapify Places schema](https://apidocs.geoapify.com/docs/places/) · [Geoapify caching and attribution](https://www.geoapify.com/places-api/)

GPS is requested only after the user chooses it. A recent fix can be reused for up to one minute when accurate within 250 m. The precise device position stays in screen memory. The app sends the centre rounded to two decimals with an 800 m search margin and filters again against the exact chosen radius on the phone.

The existing version 5 cache holds up to 20 area/radius responses. Geoapify rows use the `geoapify/` key prefix. Legacy Overpass rows keep their previous keys and parser. Fresh entries can be reused for 24 hours. Refresh bypasses freshness, and a failed refresh can return the matching saved result with its provider, timestamp and stale label. Map tiles have separate network and cache behaviour from station results.

Set `EXPO_PUBLIC_ENABLE_OVERPASS_FALLBACK=true` to opt into the legacy FOSSGIS and Private.coffee adapters. They keep their bounded POST attempts and provider cooldowns. They can use a single alternate endpoint via `EXPO_PUBLIC_OVERPASS_URL`. This fallback is disabled by default. Earlier tests found capacity errors and timeouts on both public paths. [FOSSGIS usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) · [Private.coffee terms and privacy policy](https://overpass.private.coffee/)

## Verification

The Android API 37 phone emulator rendered the live Google basemap around Mysuru through Expo Go. I checked panning, native zoom controls, the Map/List toggle, the 3, 5 and 10 km selectors, and the simulated GPS marker and recenter control. The basemap rendered in both light and dark mode. Expo Go initially reported a missing native SQLite module. A process restart restored the existing selected vehicle from SQLite and the map flow ran without a new React Native or Android runtime error. The unauthenticated Geoapify request returned HTTP 401. The FOSSGIS fallback probe timed out.

No user-owned development key was present. Android verified the missing-key state and the list screen before results. Live station counts, station marker and row selection, external directions from a real station and offline recovery from a real response are pending. Automated tests verify GeoJSON normalization, pagination, radius filtering, provider-specific caching and stale results. Pinch gestures, iOS runtime and standalone builds were outside the device checks.

Phase 4B city fuel prices and Phase 4C premium or E0 discovery remain unimplemented.
