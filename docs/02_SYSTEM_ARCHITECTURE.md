# System architecture

> **Original Phase 0 proposal (13 November 2026).** Its route tree, tabs, and IDs do not describe the checked-out app. See the [reconciliation](PHASE0_RECONCILIATION.md) and current `src/` code before implementation work.

## Shape and responsibilities

One Expo app holds all first-milestone data locally. Expo Router route files compose screens. Feature hooks load data and call use cases. Pure domain functions validate, calculate, and forecast. Repositories own parameterized Expo SQLite operations and migrations. Optional network adapters fetch station and price data and write bounded caches; the UI always distinguishes cached from fresh. There is no backend requirement for offline features. A tiny proxy may later protect provider secrets or normalize a licensed fuel-price feed; Supabase remains a separate future sync decision.

The selected vehicle ID lives in a small Context; persisted records remain in SQLite. Context does not become a second database. Screens subscribe to repository-backed hooks and refresh affected queries after mutations. Use explicit result/error states (`loading`, `ready`, `empty`, `offline`, `permissionDenied`, `error`) rather than silent defaults.

## Proposed Phase 1+ folder tree (not created yet)

```text
app/
  _layout.tsx
  index.tsx
  (tabs)/
    _layout.tsx
    index.tsx              # dashboard
    garage.tsx
    fuel.tsx
    maintenance.tsx
    more.tsx               # documents, analytics, stations, settings
  vehicle/[id].tsx
  vehicle/edit.tsx
  fuel/edit.tsx
  maintenance/edit.tsx
  documents/edit.tsx
  stations/index.tsx
  settings.tsx
src/
  components/             # buttons, cards, form fields, empty/error states
  theme/                  # colors, spacing, typography
  context/VehicleContext.tsx
  db/                     # connection, migrations, repository helpers
  features/
    vehicles/              # types, validation, repository, hooks
    fuel/                  # entry rules, economy, repository, hooks
    maintenance/           # plans, due forecast, repository, hooks
    expenses/
    documents/
    analytics/
    stations/              # Overpass adapter, cache, optional map adapter
    prices/                # provider interface, cache
    ocr/                   # later native adapter, parser, review
  services/               # permission and notification adapters
  utils/                  # dates, units, error formatting
tests/                    # pure domain and database integration tests
docs/
```

Routes reference feature APIs, not SQL. Keep one repository per feature rather than adding generic base classes or a dependency injection framework. Database setup applies versioned migrations before first queries. Repositories use prepared/parameterized values. Related writes (for example service plus items) run in a transaction. [SQLite design](04_DATABASE_DESIGN.md) defines entities and units.

## Navigation and shared code

Use five tabs: Dashboard, Garage, Fuel, Maintenance, More. More opens Documents, Analytics, Stations, and Settings. Vehicle detail, record detail, and add/edit screens are stack routes above their tab. Empty garage leads to add-vehicle onboarding; later launches return to the last valid selected vehicle. Every vehicle-scoped screen shows the current vehicle and offers a switcher. Route IDs are validated against SQLite so stale deep links show a recoverable error.

Android on Windows is the first test target. The same TypeScript screens and logic are intended for iOS. The boundaries around notification scheduling, location, camera/library access, OCR, map renderer, and external navigation allow platform-specific implementation without forking business logic. iOS behavior requires later validation on an iOS build/device; Windows alone cannot verify it.

## Data flow and consistency

1. UI captures a draft and shows field-level errors from pure validation.
2. A feature use case checks vehicle ownership, chronological/odometer rules, and any cross-record requirements.
3. Repository commits the change in SQLite; a failed transaction leaves previous data intact.
4. Feature hooks reload derived queries. Pure functions calculate full-tank mileage, monthly spending, and due states from stored data. Persist source facts, not derived totals that can go stale.
5. Notification adapter reconciles local reminder IDs after relevant changes. In-app due state is authoritative if OS notifications are denied or delayed.

Online adapters have request timeouts, bounded retry for transient errors, and cache metadata. They never block a local write. Stale results may be shown only with source and age. Missing prices stay missing. See [integration details](05_API_AND_SECURITY.md).

## Error handling, validation, and testing

Use typed domain validation errors for dates, amounts, fuel volumes, odometer order, and foreign vehicle IDs. Map SQLite and network errors to short user messages; retain diagnostic details only in development logs without image contents or personal data. Use loading and retry states, never a fake zero for unavailable values. Confirm vehicle deletion and file removal. Database migrations are incremental, transaction-protected, and tested from an older fixture.

Test pure fuel and maintenance functions with edge cases; test repository constraints, cascading deletion, and vehicle isolation against SQLite; smoke-test navigation, restart persistence, permissions denied, offline behavior, and notification scheduling on Android emulator. Test an iOS build/device before claiming iOS support. Follow each roadmap phase's gate.

## Future extensibility

If sync is approved, retain stable UUID-like local IDs, add per-row `updated_at` and deletion tombstones, and build a sync adapter beside repositories. Conflict resolution and encryption policy need a separate design before cloud upload. Optional proxy receives only the minimum city/fuel request and never vehicle history. No network service is needed for current calculations.

## Architecture decisions

| Decision | Reason | Revisit when |
| --- | --- | --- |
| Local SQLite is source of truth | Reliable offline demo and no account cost | Sync is explicitly scoped |
| Feature modules and pure calculations | Small tasks for low-cost coding models; easy tests | Repetition becomes measurable |
| Context only for vehicle selection | Avoid duplicated mutable state | Shared state becomes complex |
| List-first station discovery | Map SDK/tile policy and billing remain unresolved | Renderer passes Android+iOS and license checks |
| OCR later in development build | Native bridge cannot run in plain Expo Go | Core demo is stable |

## India Fuel Assistant implementation

The Fuel tab hosts two independent routes. Nearby Fuel Stations uses a native map with Geoapify Places and a provider-aware station cache. Indian Fuel Prices uses the documented keyless India Petroleum API and a separate SQLite cache for the PPAC metro references. One request populates the full price table for four supported metros and both fuels. The price screen uses explicit city selection, labels dates in India Standard Time, and shows where Karnataka outlet guidance is available. Both routes can open without a vehicle. [Station map](PHASE_4A_FUEL_STATION_DISCOVERY.md) · [Indian Fuel Prices](PHASE_4B_INDIAN_FUEL_PRICES.md)

## Premium fuel evidence

The explorer uses the same station route components, provider adapters and SQLite cache as Nearby Fuel Stations. Provider-specific IDs and source tags support conservative evidence classification. The separate grade catalog contains product specifications and official links. The explorer performs no geographic join across providers. [Phase 4C](PHASE_4C_PREMIUM_E0_FUEL_DISCOVERY.md)
