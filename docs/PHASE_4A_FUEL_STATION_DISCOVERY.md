# Phase 4A · Nearby Fuel Stations

Open **Fuel → Fuel Map** to start a search using the device's current location. If GPS is unavailable, submit an Indian city or address and pick a returned location. Choose a 3, 5 or 10 km radius. The map pans and zooms without triggering requests. **My Location** obtains a new device fix. **Fit stations** shows the returned markers. **List** sorts the same results by straight-line distance. **Get Directions** passes station coordinates to an external navigation app or browser.

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

On 19 November 2026, Geoapify Places returned HTTP 200 using a locally configured development credential. The API returned 56 features in the padded 5 km query. Android filtered by exact Haversine distance and displayed 30 stations at 3 km, 48 at 5 km and 82 at 10 km. The results included Vijaya Petrol Bunk, Ganesh Petrol Bunk, Bharat Petroleum and Aravind Service Station. Vijaya Petrol Bunk showed Indian Oil, its Diwan's Road address and 1.18 km straight-line distance. Provider counts can change as the station dataset changes.

Selecting Vijaya Petrol Bunk from the list highlighted its map marker. A separate tap on a map marker opened a Bharat Petroleum card at 2.72 km. Android handed Vijaya Petrol Bunk's coordinates (12.3124681, 76.647261) to Google Maps. The destination exactly matched the Geoapify point. With emulator Wi-Fi and mobile data disabled, refresh retained the 48 saved results with Geoapify attribution and the original retrieval timestamp. Automated tests cover cache freshness, provider isolation and normalization. After restarting the Expo Go process, the same 48 entries loaded from SQLite with their original retrieval timestamp. Existing vehicle data remained available.

Expo Go supplies its own basemap configuration. Standalone Android installations without a native Maps SDK key open a station list. Enable the map with a configured native key and `extra.standaloneMapEnabled: true`. The shared testing APK omits the development credential. Use the locally configured Expo Go build for the authenticated map demonstration.

The signed `DriveSentryTesting.apk` installed and cold-launched on the API 37 phone emulator as `com.drivesentry.testing`. Its Android manifest has no Google Maps SDK key. The station screen opened in list mode and showed the Places configuration message after selecting Mysuru. Populated standalone stations and their directions require an approved Places configuration. Standalone map markers also require an authorized Maps SDK for Android key restricted to the package and signing certificate. The populated Mysuru map and destination handoff were verified through Expo Go.

The local testing build uses Android debug signing and bundles both ARM64 and x86-64. Its Gradle release build sets `android.enableMinifyInReleaseBuilds=false` and `android.enableShrinkResourcesInReleaseBuilds=false`. A verification build with the default R8 minification failed during AndroidX WorkManager initialization. These flags apply to the testing artifact.

The locally configured key is ignored by Git. The exposed key's revocation could not be verified and requires checking in the authorized Geoapify dashboard. Runtime verification here covers Android. Phase 4C remains outside this implementation.
