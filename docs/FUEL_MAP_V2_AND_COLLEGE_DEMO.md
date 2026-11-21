# Fuel Map V2 and College Demo

Open **Fuel → Fuel Map** for general station discovery or **Fuel → Premium Fuel Explorer** for the same map with premium grades selected. Choose GPS, Mysuru or Bengaluru, and a 3, 5 or 10 km radius. Premium searches also offer 25 and 50 km. **Search & filters** opens location, radius, brand, and grade controls. Brand choices come from the returned provider metadata. The map groups nearby markers at broad zoom levels. Select a group to zoom or use **List** for individual stations. Selection remains visible when switching views.

The station card shows the best mapped name, address, distance, separate petrol and diesel price availability, and directions. **Station details** expands source references, fuel tags and grade evidence. **Check fuel prices** offers an official lookup for recognized oil companies, a separate city reference screen, and a personal estimate from a rate the user enters. The estimate stays in that screen and does not write a fuel record or publish a quote. Station caches work offline with their original source and retrieval timestamp. The metro cache keeps its own effective date and retrieval time. SQLite stays at version 6.

## Outlet data review

The [India Fuel Pumps README](https://github.com/ForceGT/india-fuel-pumps) explains the six upstream sources. Its [MIT license](https://github.com/ForceGT/india-fuel-pumps/blob/main/LICENSE), [data dictionary](https://github.com/ForceGT/india-fuel-pumps/blob/main/docs/DATA-DICTIONARY.md), [methodology](https://github.com/ForceGT/india-fuel-pumps/blob/main/docs/METHODOLOGY.md), and [publishing workflow](https://github.com/ForceGT/india-fuel-pumps/blob/main/docs/CI-CD.md) distinguish distribution, observation dates, and source provenance.

The [manifest](https://raw.githubusercontent.com/ForceGT/india-fuel-pumps/main/dataset/index.json) read on 21 November 2026 reported 103,914 outlets and a generation time of 12:41 UTC. It resolves content-hashed geohash-3 filenames. The two sampled [Mysuru](https://raw.githubusercontent.com/ForceGT/india-fuel-pumps/main/dataset/shards/tdn.52a7c769c7762353.json) and [Bengaluru](https://raw.githubusercontent.com/ForceGT/india-fuel-pumps/main/dataset/shards/tdr.6005bf4270e19df3.json) shards were filtered by exact 10 km distance from the app's demo coordinates. Each numerator counts returned outlets with at least one non-null `products[].priceInr`.

| Brand | Mysuru | Bengaluru | Reported source in the dataset |
| --- | ---: | ---: | --- |
| BPCL | 31 / 44 | 82 / 93 | Undocumented mobile app backend referenced by the project |
| HPCL | 21 / 21 | 48 / 48 | Retail locator |
| IndianOil | 41 / 48 | 100 / 116 | Retail locator |
| Jio-bp | 1 / 1 | 2 / 2 | Undocumented mobile app backend referenced by the project |
| Nayara | 9 / 9 | 53 / 53 | Web locator |
| Shell | 0 / 4 | 0 / 35 | Locator widget that provides product names |
| **Total** | **103 / 127** | **285 / 347** | **Records in the sampled snapshot** |

Examples include Mysuru's Prema Fuel Station (IndianOil outlet 197349, XP100 ₹167.35) and Bengaluru's East End Service Station (HPCL outlet 97704, Power95 ₹121.11). Other raw names include XP95, XtraGreen Diesel, TurboJet, SPEED, SPEED 100 BS IV and Power 100. Product names carry no verified ethanol classification. Local priced rows were captured from 18 to 21 November. The schema supplies crawler observation times, outlet IDs, original product strings, and source URLs. It supplies no pump-price effective date for these records. The documented daily workflow may retain older brand records across a partial refresh. An index update alone therefore cannot establish price freshness.

The repository's MIT grant and provenance make selected shards practical for bounded inspection. Permission to redistribute the upstream site and app data remains unresolved. [IndianOil's site policy](https://iocl.com/pages/HyperlinkingPolicy) and [Shell India's terms](https://www.shell.in/terms-and-conditions.html) restrict reproduction. The [HPCL terms](https://www.hindustanpetroleum.com/pages/terms-of-use?lang=hindi) describe attributed reproduction of certain site materials, while the [HPCL disclaimer](https://www.hindustanpetroleum.com/pages/disclaimer) describes personal and non-commercial use. The exact retail feed's reuse rights were unclear. [BPCL's terms](https://www.bharatpetroleum.in/terms-of-use.aspx) were inaccessible during this review, and no public reuse grant was found for the [Jio-bp app data](https://www.jiobp.com/disclaimer) or [Nayara locator](https://www.nayaraenergy.com/). DriveSentry ships no shard or adapter for this source and sends no requests to these oil-company endpoints. If redistribution is established later, a read-only adapter can load only intersecting immutable shards and preserve each source's identifier and crawler date separately from the device retrieval time.

## Google Places

[Places API (New)](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places#FuelOptions) documents last-known price by fuel type and an optional provider observation/update timestamp. Market and outlet coverage in India remain unverified without authenticated requests. Calls require an enabled Places API and a credential on a billing-enabled project. Requesting `fuelOptions` triggers the Enterprise + Atmosphere SKU. The eligible India list shows 7,000 monthly free billable events per relevant SKU, then US$7.50 per thousand Place Details calls or US$12.00 per thousand Nearby Search calls in the first paid tier. Google also limits storage and caching of Places content and specifies display and attribution requirements. No paid requests or cloud resources were created. [Billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) · [India rates](https://developers.google.com/maps/billing-and-pricing/pricing-india) · [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)

## Provider boundaries

Geoapify remains the primary discovery source, with the optional OpenStreetMap fallback. Both use the same display-name policy. A distinct source name or alternate name takes priority. Brand-only and operator-only records can use a sourced road or locality. Records lacking those attributes show **Fuel station** with available address data and **Exact outlet name not listed**. Unsupported metadata and old placeholder strings carry no naming evidence.

Exact provider IDs take priority, followed by an identical OSM reference within 60 metres. An OSM pin and mapped way can share one canonical display ID when the pin lies inside the returned footprint, their map points are within 25 metres, their normalized addresses agree, and name or brand tags do not conflict. Cross-provider matching without a shared ID requires a distinct matching name, matching brand and address, and points within 30 metres. These secondary matches require reciprocal uniqueness. Original provider IDs, OSM links and fuel evidence remain attached. Nearby distinct markers can share a cluster without losing their individual List entries. Selecting an outlet zooms more closely when a distinct pin is nearby. This preserves both coordinates and their individual directions.

Geoapify returned point coordinates for both pins and areas in Places. The app requests full geometry for up to two candidate ways per online search, using the same configured Geoapify account and its credit allowance. It checks the returned OSM reference and polygon before using it. A limited in-memory cache reuses successful footprints for up to 24 hours. The SQLite search cache retains verified geometry and the original result timestamp, within its existing 20-result limit. Older caches refresh on their next online search and remain usable offline. Missing, denied or unmatched geometry leaves both records separate. [Geoapify Place Details](https://apidocs.geoapify.com/docs/places/place-details/)

The price model distinguishes outlet reports, historical outlet observations, city references, user-provided estimates and unavailable prices. An outlet quote requires canonical and provider outlet IDs, a fuel type and product, integer INR paise per litre, HTTPS source, and retrieval time. A historical observation also requires an observation timestamp. An effective date is optional and independent. An observation or retrieval older than 24 hours, or an effective date more than one Indian calendar day old, marks the outlet quote stale. Metro references retain their separate freshness rules. Premium grade and E0 evidence still use their own dated proof criteria.

### Official outlet price checks

| Source | Verified capability and app behavior |
| --- | --- |
| [IndianOil price check](https://www.iocl.com/petrol-diesel-price) and [IndianOil ONE](https://play.google.com/store/apps/details?id=cx.indianoil.in) | IndianOil ONE publishes a consumer locator. IndianOil's public instructions describe indicative petrol and diesel prices via SMS using the exact dealer code displayed at the outlet. DriveSentry opens those instructions without guessing a code or sending SMS. The public consumer surfaces provide no documented reuse grant for automated retrieval. |
| [Hello BPCL](https://play.google.com/store/apps/details?id=com.bpcl.hellob2c) | BPCL states that consumers can check prices at a selected retail outlet. DriveSentry links to the official app listing. A documented public API or permission to reuse the price feed was not established. |
| [HP PAY](https://play.google.com/store/apps/details?id=com.drivetrackplusrefuel) and [HPCL price information](https://www.hindustanpetroleum.com/PriceBuildup) | HP PAY provides a consumer locator. HPCL publishes price information for selected locations. DriveSentry links to both and asks the user to confirm the rate at the outlet. The selected-location website has no established reusable station-price feed. |
| [India Fuel Pumps](https://github.com/ForceGT/india-fuel-pumps) | Rechecked 22 November 2026. The manifest still returned 103,914 outlets and the two shards above. The 10 km samples still contained price observations for 103 of 127 Mysuru outlets and 285 of 347 Bengaluru outlets. Crawler capture times cover 18–21 November in Mysuru and 19–21 November in Bengaluru. The MIT repository license leaves upstream rights unresolved. An integration needs documented programmatic access and permission from the relevant rights holders to display and cache those outlet price records. |
| [Google Places fuel options](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places#FuelOptions) | An enabled Places API, permission to use the relevant Google content and a billing-enabled credential are required to verify outlet coverage. Indian outlet availability remains unverified. |

DriveSentry currently shows no numeric outlet quote from these five sources. The PPAC-based provider continues to supply supported metro references on the dedicated screen. Receipt-assisted entry is a future option.

## College Demo launcher

On Windows, run this from the project workspace after installing dependencies, Expo Go and the phone AVD.

```powershell
pwsh -NoProfile -File scripts/College-Demo.ps1
```

The launcher reuses the named AVD, or starts it as a normal emulator window when needed. It starts or reuses Metro on port 8091, confirms that Metro belongs to this workspace, connects Expo Go to it over ADB, and opens the Fuel tab. It opens the workspace and `StationFinder.tsx` in VS Code when the launcher is available. Use `-NoEditor` for a device-only session, `-Port` for a different local port, or `-Avd` for another existing virtual device. Local logs are under the ignored `.expo/college-demo/` directory. Keep the editor on an application source file when sharing the screen.

For Android Studio embedding, enable **Launch in the Running Devices tool window** under **Settings → Tools → Emulator**. Start the phone through **Running Devices → Add device** before using the launcher. The tool window's **View Mode → Window** lets it sit beside VS Code. The launcher reuses an already running Studio-managed phone. [Android Studio emulator placement](https://developer.android.com/studio/run/emulator-launch-separate-window)

## Outlet quality verification on 22 November 2026

The same live Geoapify Mysuru sample produced these counts before and after corroborating two duplicates. All raw Place IDs in the sampled radii were unique. The original fallback label appeared because the Places record and its OSM tags could both omit a name.

| Radius | Raw mapped records | Raw records without a name | Distinct displayed outlets |
| --- | ---: | ---: | ---: |
| 3 km | 30 | 6 | 28 |
| 5 km | 48 | 13 | 46 |
| 10 km | 82 | 22 | 80 |

The [Ashoka Road pin](https://www.openstreetmap.org/node/3380635539) was inside its [mapped footprint](https://www.openstreetmap.org/way/623813382), with map points about 9 m apart. The [Bangalore Road pin](https://www.openstreetmap.org/node/3380635540) was inside a [different footprint](https://www.openstreetmap.org/way/623813381), with points about 10 m apart. The new card links to both records for each match. Neither pin lies in the other footprint. Ganesh Petrol Bunk and Vijaya Petrol Bunk remained distinct despite being roughly 48 m apart. The two [Bogadi](https://www.openstreetmap.org/way/1421132034) [footprints](https://www.openstreetmap.org/way/1421132033) also stayed separate. Business POIs are suppressed beneath station markers where supported by the map SDK.

The Android emulator showed a clear Tyagaraja Road address fallback and kept Vijaya Petrol Bunk's source name. Cluster zoom, map and list selection, individual petrol and diesel fallback labels, and the separate Delhi metro reference passed. Android opened Chrome for the IndianOil link. Chrome's first-run screen prevented an in-browser content check. The public IndianOil instructions were verified separately. A user-entered test rate and quantity produced an estimate labeled **User-provided price**.

With both emulator radios disabled, refresh retained the 46 deduplicated 5 km results and their original timestamp. Simulated GPS and recentering worked. The existing Tracker vehicle and maintenance screens opened. Google Maps received the selected Ashoka Road coordinates, `12.3252255,76.6582374`, and rendered a route from the simulator's Mysuru location.

All 68 automated tests passed, including added coverage for names, matched and ambiguous footprints, source references, legacy offline cache, selected-pin zoom and price freshness. Frozen install, TypeScript, ESLint, Expo compatibility, Android export and Git diff checks passed.

## Earlier Fuel Map V2 verification

On the Android API 37 phone in Expo Go, Mysuru showed 30, 48 and 82 Geoapify stations at 3, 5 and 10 km. The 5 km result was refreshed online. Bengaluru showed 89 stations at 5 km, and refreshing with the Bharat Petroleum filter showed 18 matches. The emulator rendered cluster counts and zoomed when a cluster was tapped. Selecting Vijaya Petrol Bunk from List highlighted it on the map and showed separate unavailable petrol and diesel prices. Tapping the Nayara marker opened its station card. The coordinate intent reached Google Maps, which then showed an app-not-responding dialog. Route rendering inside Google Maps could not be verified in that run.

With both emulator radios disabled, the Mysuru refresh kept all 48 cached stations, their original retrieval timestamp, and a stale label. The app and basemap rendered in light and dark themes. Mysuru's premium search showed one community-tagged match and zero Verified E0 results at 5 km. The public metro endpoint returned HTTP 200 with an effective and source-posted date of 20 November 2026. Delhi's table reported petrol ₹102.12/L and diesel ₹95.20/L as city references.

Frozen pnpm install, TypeScript, ESLint, Expo compatibility, Android export, and Git diff checks passed. All 60 automated tests passed, including cluster membership, explicit identity deduplication, version 6 price cache compatibility, and price freshness. iOS runtime was untested.

The Windows verification reused the existing Medium Phone AVD in Android Studio's detached Running Devices panel on the right and opened `StationFinder.tsx` in VS Code on the left. The launcher opened the Fuel Assistant after the emulator restart. The previously selected vehicle was still present.
