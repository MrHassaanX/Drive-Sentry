# APIs, permissions, security, and offline behavior

> **Original Phase 0 integration research (13 November 2026).** The checked-out app has no external API, map, OCR, or notification integration. Recheck provider terms and SDK compatibility before use. See the [reconciliation](PHASE0_RECONCILIATION.md).

Research checked on 13 November 2026. Provider terms, SDK support, quotas, and prices can change; recheck before implementation or a public release. “Verified” here means documentation confirms a capability, not that this project has run a live integration.

## Nearby fuel stations: OpenStreetMap / Overpass

[OSM documents `amenity=fuel`](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dfuel) for fuel stations and optional `fuel:*` tags. Query `node`, `way`, and `relation` with `amenity=fuel` in a small radius around a foreground location using Overpass QL; request `out center tags` so non-node features have display coordinates. A bounded query such as `nwr(around:3000,lat,lon)[amenity=fuel]; out center tags;` is a design example, not a tested endpoint response. Validate coordinates, cap radius and result count, sort by calculated straight-line distance, and show OSM attribution. A straight-line distance is not route distance. Use an external maps app for turn-by-turn directions.

[Public Overpass instances](https://wiki.openstreetmap.org/wiki/Overpass_API) are shared, best-effort infrastructure with usage policies that differ by instance. The main instance gives broad fair-use guidance, not a per-app quota guarantee. Search only on explicit screen open or refresh, debounce movement, cache by rounded area/radius for about 24 hours, cap concurrent calls at one, and back off on 429/timeouts. Identify the app where the transport permits. Do not poll in the background. Before Phase 4, test one small Indian-city query, actual response shape, latency, attribution, and service availability. A cached list with age is the offline fallback; otherwise show “stations unavailable.”

### Map rendering decision

[Expo's `react-native-maps` guide](https://docs.expo.dev/versions/latest/sdk/map-view/) says the library uses Google Maps on Android and Apple Maps or Google Maps on iOS. Its [installation guide](https://github.com/react-native-maps/react-native-maps/blob/master/docs/installation.md) describes Android Google Maps API-key and billing setup for deployed builds. Its [tile guide](https://github.com/react-native-maps/react-native-maps/blob/master/docs/tiles.md) specifically warns that public OSM tiles do not work with `URLTile` on Android and are unsuitable beyond small iOS tests. The [OSM Foundation tile policy](https://operations.osmfoundation.org/policies/tiles/) also requires visible attribution, identifiable requests, and compliant caching, and prohibits bulk prefetch.

Therefore Phase 4 uses a **list-first** station view and external directions, with no embedded map dependency. If a map is later wanted, evaluate a licensed OSM-compatible tile provider and renderer on both platforms, including cost, keys, attribution, caching, and Expo development-build compatibility. `react-native-maps` remains a candidate if Google Maps billing is acceptable. Do not assume that OSM station data grants free map tiles or removes Google billing.

## Indian petrol and diesel prices

[PPAC publishes daily retail-selling-price tables for four metro cities](https://ppac.gov.in/retail-selling-price-rsp-of-petrol-diesel-and-domestic-lpg/rsp-of-petrol-and-diesel-in-metro-cities-since-16-6-2017); that is a documented data source, **not a confirmed public JSON API**. The [PPAC website policy](https://ppac.gov.in/website-policies) says reproduction requires permission by email, accurate presentation, and prominent attribution. Obtain permission and verify machine-access terms before automated ingestion or redistribution. No direct app scraping or unattended PDF parsing is approved by this plan.

[IndianOil explains](https://www.iocl.com/petrol-diesel-price) that its SMS prices are indicative and outlet prices may vary even within a city. A city observation can be labelled “city reference price” with city, fuel, source, date of price revision, fetch time, and stale state; it must never appear on an OSM station card as that outlet's price. The app's own `refuelling_records` retain actual user-entered purchase price separately.

The provider adapter contract is `getCityPrice(cityCode, fuelType) -> { pricePaisePerLitre, observedOn, fetchedAt, sourceName, sourceUrl } | unavailable`. Accept only documented city coverage, provenance, valid positive numbers, and an observation date no later than the fetch date. Cache each observation in `fuel_price_cache`; attempt at most one refresh per city/fuel per day after the expected morning publication window, and show a labelled stale cached observation if refresh fails. “Daily” describes the source's publication cadence, not guaranteed daily price changes. Do not show an old value as today's price.

An unaffiliated [India Petroleum API](https://india-petroleum-api.vercel.app/docs) describes a keyless PPAC-derived metro feed; its uptime, terms, and underlying PPAC permission have **not** been verified here. It is a research candidate only. Other commercial city feeds likewise require licensing, coverage, cost, and quota review. If no suitable source is validated, omit live prices from the demo and allow manual refuelling prices; a clearly labelled, dated example screenshot or instructor-provided fixture can illustrate the design without claiming a live feed. Avoid embedding a private provider key in the Expo bundle; any secret-requiring provider needs a minimal proxy with server-side key storage, limits, and no vehicle data.

## Specialty fuel and E0

OSM `fuel:*` tags may describe fuel grades, but their presence, consistency, and freshness in India are unverified. E0 means zero-ethanol petrol; no nationwide reliable E0 inventory or stock API has been established. Do not infer E0 from “premium,” high octane, brand, or a missing ethanol tag. A future feature may display only explicitly tagged candidate outlets, with “unverified; call the station” and a date/source, after field coverage is measured. It is not a milestone dependency.

## OCR and images

[ML Kit Text Recognition v2](https://developers.google.com/ml-kit/vision/text-recognition/v2) is on-device OCR for Latin and several other scripts; it returns text, not a verified invoice schema. Recognition accuracy depends on capture quality and script/model choice. Candidate totals, dates, parts, and labour are parsed by deterministic code and always reviewed by the user. [Expo documents](https://docs.expo.dev/workflow/customizing/) that custom native libraries need a development build; Expo Go alone cannot host an arbitrary ML Kit bridge. Before implementation, verify a maintained React Native bridge, Expo SDK compatibility, Android and iOS build behavior, license, and offline model packaging. Use manual entry if it fails. Never send receipt images to a cloud OCR service by default.

## Permissions and local notifications

| Permission / access | When requested | Denial path |
| --- | --- | --- |
| Foreground location | User opens nearby stations and chooses current location | Manual area or no stations; vehicle features keep working. No background location. |
| Photo library / picker | User attaches a document or selects a receipt | Metadata/manual entry. Use system picker with least access available. |
| Camera | User actively captures a receipt/document | Select existing image or type data. |
| Notifications | User enables reminders after seeing their purpose | In-app due cards remain visible. |

[Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) documents platform permission differences and Android exact-alarm restrictions. Reminders are nonurgent: use ordinary local scheduling rather than requesting exact-alarm privileges. Schedule a bounded upcoming window, reconcile when plans/documents change or the app resumes, and test time-zone changes and reboot behavior. Never promise minute-exact delivery; the in-app due list is authoritative.

## Security and privacy

- SQLite and copied images remain in app-private storage. Store only a private relative file path, never a public content URI or embedded image blob in SQLite. Treat exported files as user-controlled copies. Exclude local data and secrets from source control and diagnostic logs.
- No account, phone number, VIN, RC number, precise location history, or continuous tracking is required. Vehicle registration may be a nickname or optional label. Keep location only transiently for query/cached area; do not record raw GPS trails. Avoid including document contents in logs, analytics, or crash reports.
- The app sandbox protects files from ordinary other-app access, but is not a guarantee against a compromised device or device backup access. Encryption-at-rest and secure backup policy are later decisions before sensitive documents or sync are promoted. The first demo should use non-sensitive sample documents.
- Use HTTPS for external calls, validate response shapes and sizes, escape user-visible text, and keep app/server keys out of the repository. Public endpoint URLs are not secrets. Rate-limit and timeout requests. Do not log authorization headers or full API responses.
- Explain destructive delete and local-only data loss; add export/backup in a later phase. A future Supabase sync requires explicit opt-in, per-user access rules, encrypted transport, conflict resolution, and a migration plan.

## Availability matrix

| Capability | Offline | Online dependency / failure result |
| --- | --- | --- |
| Vehicle, fuel, service, expense, document metadata CRUD | Yes | None. |
| Mileage, due state, analytics | Yes | Derived from local facts; unknown stays unknown. |
| In-app alerts | Yes | Local facts; OS notifications may be delayed or denied. |
| Local notifications | Usually | OS permission and scheduler behavior; in-app fallback. |
| OCR after model is installed | Potentially | Depends on chosen bundled/on-device model; manual fallback. |
| Nearby station search | Cached list only | Overpass and location/manual area; stale/error label. |
| Embedded map tiles | Not in first milestones | Provider and licensing decision pending. |
| City fuel prices | Dated cached value only | Validated feed and reuse rights pending; otherwise unavailable. |
