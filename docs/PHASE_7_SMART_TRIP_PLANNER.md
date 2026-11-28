# Phase 7 · Smart Trip Planner

Open **Plan a trip** from Home, **Smart Trip Planner** from Fuel, or **Plan with this vehicle** from a vehicle’s profile. The five tabs stay in place.

## Planning a trip

- Select a vehicle, choose a starting point and destination, and optionally add up to eight intermediate stops, including fuel stops. Choose places from the existing India search, pick a point on the map, or use the device’s foreground location for the start. Android emulator locations are labelled as simulated.
- Calculate a driving route to see the road distance, estimated time, and geometry. The planner shows routes the provider returns, which may include alternatives for trips without intermediate stops. List view and the route summary remain usable if basemap tiles fail.
- Choose **Find route stations** and a 3 or 5 km corridor. Stations are ordered by their position along the mapped road. Use filters for brand, fuel evidence, premium and verified E0 evidence, or straight-line distance from the road. Availability should be confirmed with the outlet.
- Enter remaining range or available fuel to see suggested stops within that estimate. Choosing a stop sends a new route request. The planner compares both road distances and shows the changed fuel and cost estimates. If rerouting fails, the original route remains available and the driving detour is pending.
- **Open in Google Maps** passes the coordinates, driving mode and up to three intermediate stops in their displayed order. If the itinerary exceeds the portable URL limit, the app asks for a shorter list before handing it off. Google Maps calculates its own route.

## Providers and coverage

| Area | Source and limits |
| --- | --- |
| Road routing | OSRM-compatible HTTPS endpoint from `EXPO_PUBLIC_OSRM_BASE_URL`, or the [FOSSGIS OSRM service](https://routing.openstreetmap.de/about.html) for the academic testing profile. The public service is rate-limited, may log requested coordinates, and provides no availability guarantee. A release build requires a configured routing service. |
| Route station discovery | [OpenStreetMap via the Asia Overpass instance](https://ovp.dresel.systems/en/), or the existing configured Overpass endpoint. The academic profile also uses the approved ForceGT location and outlet observations from relevant geographic shards under the [existing dataset policy](../THIRD_PARTY_NOTICES.md). |
| Map | Leaflet with OpenStreetMap attribution. Online tile availability varies. Saved route geometry and itinerary remain available offline. |
| External directions | Official [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started). |

The OSRM adapter validates geometry and coordinates, sets a 15-second timeout, and respects the provider’s cooldown after throttling. Requests are initiated by the user. Trips can still be entered and saved if routing is unavailable. Credential-free endpoints are supported. Keep routing credentials out of Expo public environment variables.

FOSSGIS provides an OSRM-compatible, keyless endpoint for the academic demo. Openrouteservice, GraphHopper and hosted Valhalla services were considered. Their hosted API key requirements do not fit the keyless demo or a bundled mobile credential. The provider interface keeps future routing integrations separate from itinerary and storage code. [Openrouteservice plans](https://account.heigit.org/info/plans) · [GraphHopper API](https://docs.graphhopper.com/openapi) · [Hosted Valhalla authentication](https://docs.stadiamaps.com/authentication/)

Station discovery narrows searches to a simplified road corridor and checks returned candidates against the original geometry. Long routes can have gaps where the query samples sections. The UI flags partial coverage, source failures and capped results. Existing Fuel Map identity rules deduplicate outlets. SQLite can reuse previously retrieved corridor results. A displayed station name, tag or observation does not establish that fuel is currently in stock.

## Fuel and price assumptions

The planner uses the latest valid full-tank interval for the selected vehicle and compatible fuel. You can override its mileage. Petrol and diesel use kilometres per litre and rupees per litre. CNG uses kilometres per kilogram and rupees per kilogram. Hybrids require a chosen planning fuel. Electric energy consumption is outside this model.

Estimated fuel is road kilometres divided by mileage. Estimated spending multiplies that result by the selected unit price and rounds to integer paise. The planner shows consumption without a price when one is missing. Enter your own price or choose a recent source when offered. A PPAC metro figure applies to the named city. An outlet observation applies to that outlet on its listed date. The app keeps the source, coverage and date with saved assumptions. Suggestions use your range or available fuel entry.

## Storage and data preservation

Migration 9 adds trip plans, ordered waypoints, selected fuel-stop evidence and route snapshots for each vehicle. It applies on top of version 8 and to new databases. Offline plans retain the itinerary, assumptions and last saved road route. Requests for new routes and map tiles still depend on their services. Trips can be edited, renamed, duplicated or deleted. Trip planning does not change odometers, logged refills, or ownership expenses.

## Verification

The installed DriveSentry OCR development client ran the Phase 7 bundle on `Medium_Phone_API_37.0` using the existing launcher. The signed college-demo install was kept separate.

- **Mysuru → Bengaluru:** FOSSGIS returned 144.3 km and 1 h 59 min. The emulator rendered the route and both endpoint markers. At 15 km/L and a manually entered ₹105/L, it showed 9.62 L and ₹1,010.28.
- **Bengaluru → Chennai:** The device rendered the 326.1 km route and estimated 4 h 2 min.
- **Mysuru → Ooty:** Place search returned Ooty in the Nilgiris. The device rendered the 156.4 km route and estimated 2 h 9 min.
- **Route stations and refuelling:** The 3 km corridor displayed 400 matching candidates, the app’s display cap, from OpenStreetMap and ForceGT. Selecting K Nandibasappa & Sons Bharat Petroleum Dealers produced a 147 km, 2 h 3 min driving route. The routed detour was 2.7 km and the revised estimate was 9.8 L and ₹1,029.14.
- **External directions:** Google Maps opened on Android and received the origin, destination, selected BPCL waypoint coordinates and driving mode. Google Maps displayed its own route and nearby landmark labels.
- **Saved trip and corridor cache:** After force-stopping and reopening the development app, the 147 km itinerary and the selected fuel stop were still present. The route geometry and summary reopened with Wi-Fi and mobile data disabled. The original route’s corridor also showed all 400 saved candidates and identified them as saved. The brand filter rendered a single All brands option after the fix for unbranded stations. The prior network settings were restored after testing.
- **Existing screens:** Fuel Map, Document Wallet, Ownership Analytics, Maintenance, Vehicles, Settings and both receipt capture entry points opened in the development client. The route map also rendered in light and dark appearance.
- **Signed demo data:** Both installations remained available. The signed demo still showed its pre-existing Snapshot Persistence Test vehicle at 24,680 km.

TypeScript, ESLint, 128 automated tests, and the Android JavaScript export passed. Tests cover a fresh database, upgrading through version 8, vehicle isolation, saved trip data, routing, corridor geometry and caching, and trip calculations. Expo’s bundled SDK dependency check passed. The online Expo check recommended newer versions for nine existing Expo packages. Dependencies stayed pinned for compatibility with the installed development client.

iOS runtime behavior has not been tested. Public routing and station services can throttle requests or be unavailable. Long route coverage and fuel evidence remain source-dependent.
