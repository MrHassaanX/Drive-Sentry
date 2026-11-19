# DriveSentry

**Academic title:** Smart Vehicle Management System

**Status:** Phases 1–3 passed automated checks and Android emulator smoke testing. Phase 4A adds nearby fuel station discovery. iOS runtime verification is pending.

DriveSentry is a local-first Android and iOS vehicle management app for Indian owners of cars and motorcycles. It uses manually recorded facts to show fuel spending, full-tank efficiency, and maintenance due states. It does not read a vehicle's mechanical condition, tank level, or odometer automatically, and requires no vehicle hardware.

## Current implementation

DriveSentry includes vehicle profiles with persistent selection, fuel logging and expenditure summaries, full-tank mileage, and maintenance records and schedules. Due states are calculated from calendar and distance thresholds and shown in the app. SQLite migrations reach **version 5**. The audit records which behaviors were covered by automated tests and which still need a device check.

The stack is React Native, Expo SDK 58, strict TypeScript, Expo Router, native React Native UI and StyleSheet, React Context and hooks, and Expo SQLite. Fuel quantities use integer thousandths of a litre for petrol, diesel, and hybrid liquid-fuel entries, and integer thousandths of a kilogram for CNG. Costs use integer paise. Electric charging is deferred. The code has no standalone expense ledger, document vault, receipt OCR, cloud sync, or OS notification integration.

```text
src/app/                  Home, Fuel, Maintenance, My Vehicles, Settings routes
src/components/           Reusable native UI
src/context/              Selected-vehicle state
src/db/                   SQLite migrations and setup
src/features/vehicles/    Vehicle form, validation, repository
src/features/fuel/        Fuel records and unit-aware calculations
src/features/maintenance/ Service records, schedules, due calculations
src/hooks/                Shared UI hooks
tests/                    Existing domain and migration tests
assets/                   Icons and fonts
```

## Nearby fuel stations

Open **Fuel → Find Nearby Fuel Stations**. The interactive Android and iOS map uses Geoapify Places to show stations within 3, 5 or 10 km of your foreground GPS fix or the Mysuru demo. The same results appear in a distance-sorted list, and directions open in an external app. A vehicle is optional. See [Phase 4A](docs/PHASE_4A_FUEL_STATION_DISCOVERY.md) for development key setup and verification.

## Run locally

With Node.js, pnpm, and the Android Studio emulator installed:

```powershell
pnpm install --frozen-lockfile
pnpm start
```

Press `a` in the Expo terminal to open Android, or run `pnpm android`. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` for automated checks. The audit includes the Windows emulator checklist.

## Documentation

| Document | Purpose |
| --- | --- |
| [Product requirements](docs/01_PRODUCT_REQUIREMENTS.md) | Users, scope, stories, acceptance criteria |
| [System architecture](docs/02_SYSTEM_ARCHITECTURE.md) | Module boundaries, navigation, data flow, quality strategy |
| [Flowcharts](docs/03_FLOWCHARTS.md) | Eight GitHub Mermaid diagrams |
| [Database design](docs/04_DATABASE_DESIGN.md) | SQLite schema, constraints, calculations |
| [API and security](docs/05_API_AND_SECURITY.md) | Integration evidence, cache, permissions, privacy |
| [Development roadmap](docs/06_DEVELOPMENT_ROADMAP.md) | Implementation phases and gates |
| [Academic demo](docs/07_ACADEMIC_DEMO.md) | Honest mid-project evidence and evaluation |
| [Agent rules](AGENTS.md) | Instructions for future coding tasks |
| [Phase 0 reconciliation](docs/PHASE0_RECONCILIATION.md) | Differences between the original plan and current code |
| [Phase 1–3 audit](docs/PHASE_1_3_AUDIT.md) | Repairs, verification results, and Windows smoke tests |

## Data and privacy

The current migrations create `vehicles`, `vehicle_selection`, `fuel_entries`, `maintenance_schedules`, and `maintenance_records`. The database is local to the app installation, with no garage-data upload or sync. Station searches send a rounded search centre to Geoapify or the optional Overpass fallback. See [AGENTS.md](AGENTS.md) for implementation rules.

The profile odometer is entered manually. The latest fuel reading comes from the newest refill. Maintenance checks use the higher of these readings, and saving a refill leaves the profile and previous readings as entered. A schedule uses its latest completed linked service as the active baseline. Upgraded schedules may need a confirmed fallback baseline if no completed service is available.

## Documentation status

The seven Phase 0 documents record the original plan from 13 November 2026. Their proposed route tree, schema, and milestone schedule differ from the current implementation. Read the [reconciliation](docs/PHASE0_RECONCILIATION.md) before using them. For present behavior and migrations, use `src/` and `tests/` as the source of truth.
