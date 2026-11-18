# DriveSentry

**Academic title:** Smart Vehicle Management System

**Status:** Phase 1–3 code is present; the planned audit and runtime verification have not yet been performed.

DriveSentry is a local-first Android and iOS vehicle management app for Indian owners of cars and motorcycles. It uses manually recorded facts to show fuel spending, full-tank efficiency, and maintenance due states. It does not read a vehicle's mechanical condition, tank level, or odometer automatically, and requires no vehicle hardware.

## Current implementation

The checked-out code contains Expo Router navigation, persistent vehicle management and selection, fuel-entry CRUD and recorded-refill spending, full-tank mileage calculation, and maintenance record/schedule screens with date- and distance-based due calculations. SQLite migrations currently reach **version 3**. This describes code present in the repository, not verified runtime results.

The stack is React Native, Expo SDK 58, strict TypeScript, Expo Router, native React Native UI and StyleSheet, React Context and hooks, and Expo SQLite. Fuel quantities use integer thousandths of a litre for petrol, diesel, and hybrid liquid-fuel entries, and integer thousandths of a kilogram for CNG. Costs use integer paise. Electric charging is deferred. The code has no standalone expense ledger, document vault, external API, receipt OCR, cloud sync, or OS notification integration.

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

## Run locally

With Node.js, pnpm, and the Android Studio emulator installed:

```powershell
pnpm install --frozen-lockfile
pnpm start
```

Press `a` in the Expo terminal to open Android, or run `pnpm android`. Repository checks are `pnpm typecheck`, `pnpm lint`, and `pnpm test`. These commands were not run during the documentation reconciliation. iOS runtime parity has not yet been verified.

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

## Data and privacy

The current migrations create `vehicles`, `vehicle_selection`, `fuel_entries`, `maintenance_schedules`, and `maintenance_records`. The database is local to the app installation, with no upload or sync in current code. See [AGENTS.md](AGENTS.md) for implementation rules.

## Documentation status

The seven Phase 0 documents record the original plan from 13 November 2026. Their proposed route tree, schema, and milestone schedule differ from the current implementation. Read the [reconciliation](docs/PHASE0_RECONCILIATION.md) before using them. For present behavior and migrations, use `src/` and `tests/` as the source of truth.
