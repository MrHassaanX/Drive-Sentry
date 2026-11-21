# Fuel Map V2 and College Demo

Open **Fuel → Fuel Map** for general station discovery or **Fuel → Premium Fuel Explorer** for the same map with premium grades selected. Choose GPS, Mysuru or Bengaluru, and a 3, 5 or 10 km radius. Premium searches also offer 25 and 50 km. **Search & filters** opens location, radius, brand, and grade controls. Brand choices come from the returned provider metadata. The map groups nearby markers at broad zoom levels. Select a group to zoom or use **List** for individual stations. Selection remains visible when switching views.

The station card shows separate petrol and diesel price availability and external directions. **Station details** expands the source, address, fuel tags, and grade evidence. **City reference prices** opens the existing PPAC-backed metro screen. Mysuru and Bengaluru have neither an authorized outlet feed in DriveSentry nor a metro reference in that feed. Station caches still work offline with their original source and retrieval timestamp. The metro cache keeps its own effective date and retrieval time. SQLite stays at version 6.

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

Geoapify remains the primary discovery source, with the existing optional OpenStreetMap fallback. Discovery and price records are separate. Exact provider IDs identify outlet records. A shared OSM identity within 60 metres can suppress a duplicate map marker. Brand names only filter results. Any future join without a shared ID would require corroborating coordinates, normalized name and full address, with ambiguous candidates kept apart. The price model carries product, INR paise per litre, source and retrieval timestamp, with an outlet ID required for outlet-specific quotes. City reference values stay scoped to their named city. Phase 4C grade evidence and its dated E0 criteria still determine the premium filters.

## College Demo launcher

On Windows, run this from the project workspace after installing dependencies, Expo Go and the phone AVD.

```powershell
pwsh -NoProfile -File scripts/College-Demo.ps1
```

The launcher reuses the named AVD, or starts it as a normal emulator window when needed. It starts or reuses Metro on port 8091, confirms that Metro belongs to this workspace, connects Expo Go to it over ADB, and opens the Fuel tab. It opens the workspace and `StationFinder.tsx` in VS Code when the launcher is available. Use `-NoEditor` for a device-only session, `-Port` for a different local port, or `-Avd` for another existing virtual device. Local logs are under the ignored `.expo/college-demo/` directory. Keep the editor on an application source file when sharing the screen.

For Android Studio embedding, enable **Launch in the Running Devices tool window** under **Settings → Tools → Emulator**. Start the phone through **Running Devices → Add device** before using the launcher. The tool window's **View Mode → Window** lets it sit beside VS Code. The launcher reuses an already running Studio-managed phone. [Android Studio emulator placement](https://developer.android.com/studio/run/emulator-launch-separate-window)

## Verification

On the Android API 37 phone in Expo Go, Mysuru showed 30, 48 and 82 Geoapify stations at 3, 5 and 10 km. The 5 km result was refreshed online. Bengaluru showed 89 stations at 5 km, and refreshing with the Bharat Petroleum filter showed 18 matches. The emulator rendered cluster counts and zoomed when a cluster was tapped. Selecting Vijaya Petrol Bunk from List highlighted it on the map and showed separate unavailable petrol and diesel prices. Tapping the Nayara marker opened its station card. The coordinate intent reached Google Maps, which then showed an app-not-responding dialog. Route rendering inside Google Maps could not be verified in that run.

With both emulator radios disabled, the Mysuru refresh kept all 48 cached stations, their original retrieval timestamp, and a stale label. The app and basemap rendered in light and dark themes. Mysuru's premium search showed one community-tagged match and zero Verified E0 results at 5 km. The public metro endpoint returned HTTP 200 with an effective and source-posted date of 20 November 2026. Delhi's table reported petrol ₹102.12/L and diesel ₹95.20/L as city references.

Frozen pnpm install, TypeScript, ESLint, Expo compatibility, Android export, and Git diff checks passed. All 60 automated tests passed, including cluster membership, explicit identity deduplication, version 6 price cache compatibility, and price freshness. iOS runtime was untested.

The Windows verification reused the existing Medium Phone AVD in Android Studio's detached Running Devices panel on the right and opened `StationFinder.tsx` in VS Code on the left. The launcher opened the Fuel Assistant after the emulator restart. The previously selected vehicle was still present.
