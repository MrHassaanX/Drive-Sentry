# System flows

> **Original Phase 0 proposal (13 November 2026).** These diagrams include future entities and integrations; they are not an as-built diagram. See the [reconciliation](PHASE0_RECONCILIATION.md).

These diagrams describe the planned implementation. The database and adapter names match [architecture](02_SYSTEM_ARCHITECTURE.md) and [schema](04_DATABASE_DESIGN.md). They are Mermaid blocks intended for GitHub Markdown.

## 1. System architecture

The phone owns core records and calculations. External reads are optional; a future proxy is conditional.

```mermaid
flowchart LR
  subgraph Mobile[Expo mobile application]
    UI[Expo Router screens and UI]
    Features[Feature hooks and use cases]
    Domain[Pure validation and calculations]
    Repos[SQLite repositories]
    Cache[Online adapters and cache]
    Notify[Local notification adapter]
    UI --> Features
    Features --> Domain
    Features --> Repos
    Features --> Cache
    Features --> Notify
  end
  Repos <--> DB[(Expo SQLite)]
  Cache <--> DB
  Cache --> OSM[Overpass station data]
  Cache --> Price[Validated city price source]
  Cache -. future if needed .-> Proxy[Small API proxy]
  Proxy -. licensed feed .-> Price
```

## 2. User journey

Onboarding is a first-run/empty-garage state. Alerts come from recorded facts.

```mermaid
flowchart TD
  Launch[Launch app] --> HasVehicle{Vehicle saved?}
  HasVehicle -- No --> Onboard[Short onboarding]
  Onboard --> Add[Add vehicle]
  Add --> Dash[Selected vehicle dashboard]
  HasVehicle -- Yes --> Select[Restore or select vehicle]
  Select --> Dash
  Dash --> Fuel[Fuel and expenses]
  Dash --> Maint[Maintenance]
  Dash --> Docs[Documents]
  Dash --> Analytics[Analytics]
  Fuel --> Insight[Recalculate insights]
  Maint --> Insight
  Docs --> Insight
  Analytics --> Insight
  Insight --> Alerts[Due alerts and recommendations]
  Alerts --> Dash
```

## 3. Navigation flow

The More tab keeps the primary tab bar small. Stack routes own detail and add/edit flows.

```mermaid
flowchart TD
  Root[Root stack] --> Tabs[Primary tabs]
  Tabs --> Dashboard[Dashboard]
  Tabs --> Garage[Garage]
  Tabs --> FuelTab[Fuel]
  Tabs --> MaintTab[Maintenance]
  Tabs --> More[More]
  Garage --> VehicleDetail[Vehicle detail]
  VehicleDetail --> VehicleEdit[Add or edit vehicle]
  Dashboard --> VehicleDetail
  FuelTab --> FuelDetail[Fuel record detail]
  FuelDetail --> FuelEdit[Add or edit fuel record]
  FuelTab --> FuelEdit
  MaintTab --> ServiceDetail[Service or plan detail]
  ServiceDetail --> MaintEdit[Add or edit service or plan]
  MaintTab --> MaintEdit
  More --> Documents[Documents]
  More --> Analytics[Analytics]
  More --> Stations[Stations]
  More --> Settings[Settings]
  Documents --> DocumentEdit[Document detail or edit]
```

## 4. Entity relationships

All owned facts attach to a vehicle. Global settings and caches are not vehicle records.

```mermaid
erDiagram
  VEHICLES ||--o{ REFUELLING_RECORDS : has
  VEHICLES ||--o{ MAINTENANCE_PLANS : schedules
  VEHICLES ||--o{ SERVICE_RECORDS : has
  MAINTENANCE_PLANS |o--o{ SERVICE_RECORDS : completed_by
  SERVICE_RECORDS ||--o{ SERVICE_ITEMS : contains
  SERVICE_ITEMS ||--o{ WARRANTIES : covers
  VEHICLES ||--o{ EXPENSES : has
  VEHICLES ||--o{ DOCUMENTS : has
  DOCUMENTS |o--o| SERVICE_RECORDS : invoice_for
  VEHICLES ||--o{ ALERTS : receives
  MAINTENANCE_PLANS |o--o{ ALERTS : triggers
  DOCUMENTS |o--o{ ALERTS : triggers
  VEHICLES o|--o| APP_SETTINGS : selected_in
  FUEL_PRICE_CACHE {
    string id PK
    string city_code
    string observed_on
  }
  STATION_CACHE {
    string area_key PK
    string expires_at
  }
```

Settings hold an optional `selected_vehicle_id` foreign key. The caches are independent global lookup data, so no vehicle relationship is implied.

## 5. Fuel intelligence data flow

An edit or backdated insert can change later segments, so derived values are recomputed.

```mermaid
flowchart TD
  Input[Manual entry or later reviewed OCR] --> Validate[Validate date, volume, cost, odometer, full flag]
  Validate --> Valid{Valid for this vehicle?}
  Valid -- No --> Correct[Show field error and correct]
  Correct --> Validate
  Valid -- Yes --> Save[Save record in SQLite]
  Save --> Segment[Find consecutive full-tank boundaries]
  Segment --> Complete{Complete valid segment?}
  Complete -- No --> Missing[Show insufficient data]
  Complete -- Yes --> Calculate[Distance divided by all segment litres]
  Calculate --> Analytics[Refresh cost and trend views]
  Analytics --> Baseline{Enough comparable segments?}
  Baseline -- Yes --> Anomaly[Show rule-based anomaly with explanation]
  Baseline -- No --> Quiet[No anomaly claim]
```

## 6. Maintenance forecasting

Either date or distance reaching its threshold makes a plan due. Distance-to-date prediction is optional and explicitly estimated.

```mermaid
flowchart TD
  Read[Read plan, last completion, odometer history] --> Threshold[Compute next date and distance thresholds]
  Threshold --> Rate{Reliable usage rate?}
  Rate -- Yes --> Predict[Estimate date for distance threshold]
  Rate -- No --> DistanceOnly[Show distance threshold only]
  Predict --> Earliest[Choose earliest applicable due condition]
  DistanceOnly --> Earliest
  Earliest --> State{Upcoming or overdue?}
  State -- No --> Monitor[Keep monitoring]
  State -- Yes --> Alert[Show in-app alert and reconcile local notification]
  Alert --> Done{Service completed?}
  Done -- Yes --> Record[Save service record linked to plan]
  Record --> Threshold
  Done -- No --> Monitor
```

## 7. Fuel station and price integration

Station results and city prices have separate provenance and caches. A station has no assumed live price.

```mermaid
flowchart TD
  Open[Open stations and prices] --> Location{Location granted or manual area?}
  Location -- No --> Manual[Offer manual area or explain unavailable]
  Location -- Yes --> Nearby[Check station cache for area]
  Manual --> Nearby
  Nearby --> StationFresh{Fresh station cache?}
  StationFresh -- No --> Overpass[Bounded Overpass query]
  StationFresh -- Yes --> StationList[Show stations]
  Overpass --> StationOK{Response valid?}
  StationOK -- Yes --> StationList
  StationOK -- No --> StaleStations[Show labelled stale list or error]
  Open --> PriceCache[Check city and fuel price cache]
  PriceCache --> PriceFresh{Fresh and supported?}
  PriceFresh -- No --> Provider[Fetch from validated provider]
  PriceFresh -- Yes --> PriceView[Show source and observation date]
  Provider --> PriceOK{Verified result?}
  PriceOK -- Yes --> PriceView
  PriceOK -- No --> NoPrice[Show stale labelled value or unavailable]
  StationList --> Directions[Open external directions]
  StaleStations --> Directions
```

## 8. OCR processing

OCR recognizes text; field extraction is a separate, fallible step. The user confirms every saved field.

```mermaid
flowchart TD
  Pick[Select or capture service receipt] --> Permission{Permission or picker available?}
  Permission -- No --> Manual[Enter service manually]
  Permission -- Yes --> Image[Copy image into private app storage]
  Image --> OCR[On-device ML Kit text recognition]
  OCR --> Result{Text recognized?}
  Result -- No --> Manual
  Result -- Yes --> Extract[Extract candidate date, totals, items]
  Extract --> Review[Show candidates beside image]
  Review --> Correct[User corrects fields]
  Correct --> Validate[Validate vehicle, amounts, dates, items]
  Validate --> Valid{User confirms valid record?}
  Valid -- No --> Review
  Valid -- Yes --> Save[Save verified service and items transactionally]
```
