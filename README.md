# DriveSentry

**Smart Vehicle Management System** — a local-first vehicle record app for Android and iOS, built for Indian vehicle owners.

DriveSentry helps owners organize vehicle records and turn them into useful insights over time. The current implementation includes vehicle management and fuel logging with recorded-refill expenditure and full-tank mileage calculations. Maintenance, OCR, maps, and cloud sync are not implemented yet.

## Current status

Phase 2: Expo Router navigation, on-device SQLite storage, vehicle profile management, persistent active-vehicle selection, fuel-entry CRUD, expenditure summaries, and full-tank-to-full-tank efficiency calculations.

The app stores vehicle details on the device. It does not require vehicle hardware, an account, or a network connection for the implemented features.

Mileage is calculated only between consecutive full-tank records. The calculation includes every logged refill after the previous full tank through the next full tank. A decreasing odometer sequence is rejected. Missing refill entries can still make the result inaccurate, so the app identifies it as based on recorded data. CNG quantities use kilograms; petrol, diesel, and hybrid liquid-fuel records use litres. EV charging is deferred.

## Technology

- React Native with Expo and Expo Router
- Strict TypeScript
- Native React Native components and `StyleSheet`
- Expo SQLite with versioned migrations
- React Context and hooks for the active vehicle
- Android and iOS from one shared codebase

## Run locally

Install Node.js and pnpm, then run:

```powershell
pnpm install
pnpm start
```

Press `a` in the Expo terminal to open the Android emulator, or run `pnpm android`. iOS builds require macOS; the same application code and Expo configuration support iOS.

Checks:

```powershell
pnpm typecheck
pnpm lint
pnpm test
```

## Project structure

```text
src/
  app/                 Expo Router routes and layouts
  components/          Reusable native UI primitives
  context/             Selected vehicle state
  db/                  SQLite migrations and setup
  features/vehicles/   Vehicle types, validation, form, and repository
  features/fuel/       Fuel records, unit-aware calculations, and validation
  hooks/                Shared UI hooks
tests/                 Migration, repository, validation, and mileage tests
assets/                App icons and bundled fonts
```

## Data and privacy

SQLite is the source of truth for vehicle profiles, the selected-vehicle setting, and fuel records. Migrations create `vehicles`, `vehicle_selection`, and `fuel_entries`. Fuel costs are stored as integer paise; quantities are stored as integer thousandths of a litre or kilogram. Fuel records reference their vehicle with `ON DELETE CASCADE`. The database is local to the app installation; no data is uploaded or synchronized.

## Project guidance

See [AGENTS.md](AGENTS.md) for coding and verification rules. Phase 0 specification documents were not present in the workspace when implementation began, so this README records the decisions represented by the current code.
