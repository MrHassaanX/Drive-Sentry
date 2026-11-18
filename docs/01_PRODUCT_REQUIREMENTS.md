# Product requirements

> **Original Phase 0 proposal (13 November 2026).** Current Phase 1–3 code differs from this scope. See the [reconciliation](PHASE0_RECONCILIATION.md); stories below are goals, not verified implemented features.

## Problem, users, and outcome

Indian car and motorcycle owners often keep fuel bills, service receipts, and expiry dates in separate places. DriveSentry connects user-entered records so they can see spending, know which service is due, and find missing ownership paperwork. Primary user: an individual managing one or more vehicles. Secondary user: a family member recording shared vehicles on one device. The first release is single-device and has no accounts or sharing.

The app is software-only. All odometer, fill-up, service, and document facts come from the user or a reviewed receipt. Insights are estimates from those facts. A readiness score later means **recorded-maintenance readiness**, not vehicle health.

## Scope and priority

| Priority | Capability | Boundaries |
| --- | --- | --- |
| Mid-project core | Vehicle garage, selected-vehicle dashboard, manual fuel and other-expense records, full-tank mileage, service plans/history, due alerts | Works offline; local SQLite is authoritative. |
| Next | Document metadata, expiry reminders, searchable records, richer analytics, export | Private local files; user verifies reminders and export destination. |
| Conditional online | Nearby OSM petrol stations; city-level petrol/diesel prices | Network/location dependent, freshness labelled; may show list without map. |
| Later | OCR-assisted service bills, service items, warranties, repeated-repair hints | On-device OCR compatibility and user review required. |
| Research | Genuine trained predictive model, specialty fuel discovery, Supabase sync | No claim or implementation without data, evaluation, and consent. |

Out of scope for initial milestones: hardware telemetry, live tank level, automatic odometer reading, diagnostic fault detection, vehicle health prediction, accounts, payments, and station-specific live prices.

## User stories and acceptance criteria

| ID | Story | Acceptance criterion |
| --- | --- | --- |
| V1 | As an owner, I add cars and motorcycles and switch between them. | Each vehicle has required name, type, fuel type, and nonnegative odometer; switching changes all vehicle-scoped views; data survives restart. |
| V2 | I correct a vehicle profile or remove a vehicle. | Validation prevents negative odometer and an odometer below saved readings; deletion requires confirmation and explains dependent data removal. |
| F1 | I record a fuel purchase. | Date, litres, cost, odometer, and full-tank flag are validated; a record can be edited; saved totals appear after restart. |
| F2 | I view mileage and cost per kilometre. | A value appears only for a valid full-to-full segment; partial fills inside it contribute litres and cost; incomplete segments show “insufficient data.” |
| F3 | I see monthly fuel spending and efficiency history. | Amounts are derived from saved records, grouped in local calendar months; anomalies are labelled as rule-based and show the baseline used. |
| M1 | I set a service interval by date, distance, or both. | Due state uses the first applicable threshold; dashboard distinguishes upcoming, overdue, and unknown distance forecast. |
| M2 | I record a completed service. | History stays visible; associated plan advances from the completion date/odometer; duplicate reminder notifications are cancelled or replaced. |
| M3 | I later view maintenance readiness and upcoming costs. | The score uses only recorded due/completed plans and shows missing-data limits; cost estimates identify whether they use a user estimate or past-service median. |
| E1 | I log non-fuel, non-service expenses. | Vehicle, amount, category, and date are required; analytics include each source once. |
| D1 | I store document metadata and an optional private image/file. | Expiry is optional, searchable metadata is available offline, and expiry reminders can be dismissed. |
| N1 | I browse nearby petrol pumps. | With location and network access, results include distance and OSM attribution; denial, timeout, or no results yields a useful message and manual location option. |
| P1 | I view city fuel prices when a source is validated. | Fuel type, city, source, observation date, and stale state are shown; unsupported cities or missing data never display a fabricated price. |
| O1 | I scan a service bill later. | OCR output is editable and nothing is saved until the user confirms; image remains local unless the user chooses export or future sync. |

## Nonfunctional requirements

- Android and iOS share route, domain, repository, and UI code; platform-specific code is isolated at permissions, maps, notifications, and OCR adapters. Fuel-volume and km/L features apply to petrol/diesel vehicles; electric, CNG, and other profiles need separate units/models in a later phase.
- Core record entry, history, dashboard, and calculations work without internet after install. Online tiles, station search, city prices, and model downloads may not.
- All monetary figures use INR, with integer paise internally. User-facing kilometres/litres and rounding are consistent. No account or personal identity data is required.
- Every important derived value has an explanation and a missing-data state. Permission denial never blocks core record keeping.
- Local data must survive an app restart and schema migration. Destructive actions require confirmation. Export and backup are later features, so uninstall/data loss remains a known early risk.

## Assumptions and deferred decisions

Assume one local user and INR-only expenses in the mini-project. The first milestone uses manual entry, not OCR. Decide exact map renderer, fuel-price provider, OCR bridge, and eventual sync conflict policy only after compatibility and terms checks. See [API and security](05_API_AND_SECURITY.md).
