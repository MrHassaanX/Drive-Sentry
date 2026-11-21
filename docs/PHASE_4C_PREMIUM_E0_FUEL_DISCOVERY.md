# Phase 4C · Premium Fuel Explorer

Open **Fuel → Premium Fuel Explorer** with or without a selected vehicle. Choose GPS, Mysuru or Bengaluru and a 3, 5, 10, 25 or 50 km radius. The map and list show the same filtered dataset. Select a marker or row to check evidence, follow its source and open coordinate-based directions. The grade guide includes company references and official lookup options.

## Sources reviewed

Reviewed 21 November 2026. Website review dates identify the research date. They do not establish when an outlet, product formulation or individual map record was last verified.

| Source | Product and outlet coverage | Access, reuse and dates |
| --- | --- | --- |
| [IndianOil XP100](https://iocl.com/xp100) and [XP95](https://iocl.com/pages/XP95) | XP100 is 100 octane and XP95 is 95 octane. The XP100 site links its outlet roster and IndianOil ONE. The [January 2021 launch notice](https://www.iocl.com/NewsDetails/59000) records Bengaluru as a launch city. | Human-readable references and outlet lookup. No licensed feed or reuse approval established. [IndianOil website terms](https://iocl.com/pages/HyperlinkingPolicy) restrict reproduction. A roster entry does not establish current stock or ethanol content. |
| [BPCL SPEED](https://www.bharatpetroleum.in/our-businesses/fuels-and-services/about-fuels-and-services.aspx), [SPEED 97](https://www.bharatpetroleum.in/our-businesses/fuels-and-services/speed-97) and [SPEED 100](https://www.bharatpetroleum.in/images/files/jwaladhwani-february-2026-updated.pdf) | BPCL documents standard SPEED, SPEED 97 and the launch of 100-octane SPEED 100 in 2026. The SPEED 97 page directs customers to BPCL's fuel-station lookup. No reusable SPEED 100 outlet feed or current outlet composition was established. | Browser lookup and official February 2026 bulletin. The SPEED 97 page displays an update date of 13 November 2025. [BPCL site terms](https://www.bharatpetroleum.in/terms-of-use.aspx) restrict reproduction. |
| [HPCL petrol](https://www.hindustanpetroleum.com/pages/petrol), [poWer99](https://www.hindustanpetroleum.com/pages/power99) and [poWer100](https://www.hindustanpetroleum.com/power100?lang=hindi) | HPCL documents 99 and 100 octane and publishes premium outlet information including Bengaluru on the poWer100 page. Check HPCL for the current standard poWer specification. | Human-readable references. No licensed outlet feed established. No station-data update date was verified. The [100 RON brochure](https://www.hindustanpetroleum.com/documents/pdf/Power100_Jan-2023.pdf) describes octane. Additive composition does not establish the ethanol content of finished petrol. |
| [Geoapify Places](https://apidocs.geoapify.com/docs/places/) and [OpenStreetMap](https://www.openstreetmap.org/copyright) | Nearby general fuel stations and explicit fuel flags when present in the provider data. The petrol brand alone carries no grade or composition evidence. | The existing API integration and attributed caching are reused. The provider retrieval timestamp does not establish the last time the outlet verified a tag. [Geoapify caching and attribution](https://www.geoapify.com/places-api/) |
| [E0Fuel](https://e0fuel.in/find/) | Functional reference for grade filters, map and evidence inspection. | Interface review only. No listings imported or queried. |
| [Autocar India laboratory report](https://www.autocarindia.com/auto-features/how-much-ethanol-is-in-your-petrol-437339) | Mumbai samples measured XP95 at 19.88% ethanol and XP100 below 0.20% by the published method. | Published 22 September 2025. Two sample observations appear in the grade guide. The measurements do not describe current fuel at a Mysuru or Bengaluru outlet and cannot pass the E0 filter. |

The app includes no copied OMC directory and no official outlet records. Official site references can help users check listed locations independently. A generic 95, 97, 98, 99 or 100 octane tag is shown with brand unspecified. An explicit named-grade tag also remains community-reported. A community ethanol-free tag is a claim with no verification date. None of these signals establishes pump stock or E0.

## Evidence and data model

The explorer shares the station hook, map, distance calculation, list, directions and provider layer with Phase 4A. Positive fuel flags are normalized from Geoapify's returned source tags or from the optional Overpass adapter. Evidence has a station ID, grade, source identity, publisher, URL, retrieval time and optional verification date. OSM entity links are used when a valid source ID is present. Evidence binds only to the exact provider station ID. Overlaps, matching names and shared brands do not join records.

A verified E0 entry requires a dated official outlet-and-grade record and explicit ethanol-free proof from the grade's accepted publisher. The composition record must link to that exact outlet-grade record. Outlet-scoped and product-scoped proof are displayed separately. Both dates must be valid and no more than 180 days old. Cached retrieval never extends a verification date. No eligible production E0 records are loaded. Follow the vehicle manufacturer's fuel specification and confirm availability with the outlet before visiting.

## SQLite and offline behavior

Database version 6 and migrations 1–6 remain intact. The existing provider-prefixed area/radius cache keeps the original tags, source identity and retrieval date. Evidence is derived from the saved response on read. Its verification date is unavailable for community records. The 24-hour refresh policy, stale fallback and 20-result retention remain in force. Geoapify is capped at two pages of 100 results. Wide searches can reach this cap and are not exhaustive, especially in Bengaluru. Overpass fallback remains limited to at most 10 km.

## Demonstration

1. Search Mysuru or Bengaluru. Inspect the map and **List** with **All premium grades** selected.
2. Inspect a mapped octane signal and its source. Open the grade guide to compare it with the official product specification.
3. Switch to **Verified E0 only**. The empty state describes the evidence gap. **All stations** allows general browsing with unconfirmed grade labels.
4. Refresh while offline after a successful search to show the cached provider timestamp and stale status.

## Verification

On 21 November 2026 the Android Expo Go run found one mapped premium signal in Mysuru at each of 3, 5, 10, 25 and 50 km. The same Indian Oil station on Jhansi Lakshmibai Road displayed generic 95- and 98-octane tags. It appeared in the list and on the map, and both selection paths opened its details. The XP100 and SPEED 100 filters each returned zero at 5 km. The 10 and 50 km searches in Bengaluru each showed two stations with community fuel tags. At 10 km, these were Shell Petrol Bunk on 8th Cross Road with a generic 100-octane tag and Bharat Petroleum on Thippasandra Main Road with generic 95- and 98-octane tags. Verified E0 returned zero for Mysuru at 5 km and Bengaluru at 10 km. These counts describe the returned records and may change with the source or radius limits.

The Bengaluru map rendered in light and dark themes. With emulator Wi-Fi and mobile data disabled and no active default network, refreshing the 10 km search retained both mapped matches and the original source timestamp. The fuel-grade guide opened with official lookup links. Emulator captures include the Mysuru map and evidence card, the E0 empty state, the Bengaluru dark map, and the offline result.

Simulated GPS displayed a device-position marker and recentered the map. Directions handed the selected Mysuru station coordinates `12.2933335,76.6453029` to the Android Google Maps activity. The general Nearby search, Indian Fuel Prices and the existing tab routes were also exercised in the combined app.

All 57 tests passed. The suite covers the catalog, named and generic flags, source and station identity, duplicate flags, E0 proof freshness and linkage, the broad-radius query and stale-cache provenance. The existing migration tests cover the version 6 upgrade and data preservation. Frozen pnpm install, TypeScript, ESLint, Expo dependency compatibility, Android export and Git diff checks passed.

The prior standalone testing APK retains the Maps SDK and Places configuration limitation. This phase uses Expo Go and does not rebuild that APK.
