# Development roadmap

> **Original Phase 0 schedule (13 November 2026).** Phases 1–3 have since produced code with a different scope. Use the [reconciliation](PHASE0_RECONCILIATION.md) and a fresh audit before planning more work; this is no longer an execution checklist.

This sequence favors a working vertical slice within a few days. Phase numbers are task boundaries for future Codex sessions; Phase 0 is documentation only. No calendar promise assumes a particular developer speed. Re-estimate after each gate. Keep changes small enough to review and run on the Android Studio emulator.

## Dependency path

```text
Phase 0 docs
  -> Phase 1 app shell + vehicles + SQLite
  -> Phase 2 fuel + expenses + correct mileage
  -> Phase 3 maintenance + in-app/OS reminders
  -> mid-project demonstration
  -> Phase 4 stations (conditional)
  -> Phase 5 documents + broader analytics/export
  -> Phase 6 OCR and bill intelligence (conditional)
  -> Phase 7 optional sync/ML research
```

Phases 4 and 5 can be reordered after the mid-project demonstration. A map is not a prerequisite for station discovery. Live city prices and E0 are independent research tasks and must not delay the core demo.

## Phase 0 — architecture and design (this delivery)

- **Objective:** Agree on the local-first scope, schema, flows, integration limits, and demonstration criteria.
- **Components:** README, agent rules, seven design documents, eight Mermaid diagrams.
- **Dependencies:** Project brief and repository inspection.
- **Deliverables:** Reviewable Markdown documents only.
- **Acceptance criteria:** All requested files and diagrams exist; no app feature or Expo scaffold exists; unknown API capabilities are labelled.
- **Required tests:** Check document links, diagram fences, schema syntax where a local SQLite interpreter is available, and cross-document consistency.
- **Risks:** Provider terms and platform compatibility can change before implementation.
- **Definition of done:** Documentation passes the above checks and Phase 1 has a precise entry scope.

## Phase 1 — app foundation, garage, and dashboard

- **Objective:** Make the first persistent, navigable app slice.
- **Components:** Create Expo Router project with strict TypeScript; install SDK-compatible SQLite; implement root/tab/stack routes and native UI primitives; v1 migration/connection; vehicle repository/validation/CRUD; selected-vehicle Context; empty and error states; dashboard with vehicle identity, current odometer, and truthful “no records yet” cards.
- **Dependencies:** Phase 0 schema and navigation decisions; Android Studio emulator.
- **Deliverables:** Locally runnable Android development app and a short setup/test note. No fuel or maintenance behavior yet.
- **Acceptance criteria:** Add two vehicles, switch, edit, delete with confirmation, restart, and see consistent selected-vehicle data. Invalid names/negative odometer are rejected. Deep-link/missing ID is recoverable.
- **Required tests:** TypeScript check; migration/foreign-key/vehicle-isolation tests; Android emulator navigation and restart smoke test. Record iOS as untested until built.
- **Risks:** SDK/native package mismatch; schema migration mistakes; rushed UI.
- **Definition of done:** A clean install and restart preserve garage data, tests pass, and the dashboard never displays invented totals.

## Phase 2 — fuel, expenses, and explainable efficiency

- **Objective:** Turn manual refuelling data into defensible cost and mileage insights.
- **Components:** Fuel and standalone expense entry/history/edit/delete; odometer validation; full-tank segment calculator; monthly fuel/other spending and cost per kilometre; simple trend chart or table; missing-data explanations.
- **Dependencies:** Phase 1 database and vehicle selection.
- **Deliverables:** Demonstrable two-vehicle fuel history with calculated segments and expenditure totals.
- **Acceptance criteria:** A full–partial–full sequence includes both later volumes; a partial-only sequence has no mileage; backdated conflicting odometer is rejected; a vehicle switch cannot show another vehicle's records; monthly costs count each source once.
- **Required tests:** Pure function cases for full/partial/missing/zero-distance sequences and rounding; repository persistence/isolation and edit-recalculation tests; emulator form/restart smoke test.
- **Risks:** Ambiguous fill-up history and decimal rounding. Explain assumptions in UI; allow a reset baseline after a missing purchase.
- **Definition of done:** Every displayed metric can be reproduced from stored records and invalid sequences show “insufficient data.”

## Phase 3 — maintenance plans, history, and alerts

- **Objective:** Warn owners about service needs using recorded dates and distance.
- **Components:** Maintenance plan CRUD, service-history CRUD, date/km due calculation, basic estimated next due state, dashboard cards, in-app alerts, optional local notifications with permission prompt and reconciliation.
- **Dependencies:** Phase 1 vehicle data and odometer handling; Phase 2 provides additional odometer observations but service works without them.
- **Deliverables:** End-to-end maintenance scheduling and completion flow.
- **Acceptance criteria:** Either date or km threshold can make a plan due; an overdue state is visible offline; recording a linked service advances the plan; denied notification permission still leaves in-app alerts; no mechanical-health claim appears.
- **Required tests:** Calendar month-end and leap-year examples, due-by-either-condition, no-usage-rate forecast, reminder dedupe/reconciliation, repository ownership; Android permission-denied and restart smoke test.
- **Risks:** OS delivery timing and time-zone changes; estimate confidence. Use ordinary reminders and keep the in-app state authoritative.
- **Definition of done:** A user can demonstrate a due plan, record completion, and see the next threshold without relying on internet or OS notification delivery.

### Mid-project submission gate

After Phase 3, demonstrate one coherent workflow: create/select vehicle → log full/partial/full fuel purchases and an expense → explain mileage and monthly spend → set a maintenance plan → show an overdue alert → record service completion. This is meaningful functional progress across persistence, business rules, and automation. It is **not** a numerical claim that exactly 50% of all planned work is finished. Remaining scope includes documents/export, online integrations, OCR, warranties/repeated repairs, broader analytics, cross-platform verification, and optional research.

If the deadline falls before Phase 3 is complete, submit only what is working, identify missing steps, and show test evidence. A static screen count does not substitute for working flows. Station discovery is a stretch goal only after the core gate passes.

## Phase 4 — nearby station discovery (conditional)

- **Objective:** Provide useful location-based discovery without blocking core features.
- **Components:** Foreground location/manual area selection; bounded Overpass adapter; normalized station list with distance, attribution, 24-hour cache, stale/error states, and external directions. Embedded map only after a separate renderer/provider decision.
- **Dependencies:** Phase 1 navigation; API and map policy validation in [API/security](05_API_AND_SECURITY.md).
- **Deliverables:** Station list in a selected demo area, or a documented blocked integration with cached/sample UI clearly marked.
- **Acceptance criteria:** One small live query succeeds under acceptable terms; denial and offline paths work; city prices are not attached to stations.
- **Required tests:** Response normalization fixture, bad coordinate/timeouts/429 handling, cache freshness, emulator location denied/granted, attribution and directions.
- **Risks:** Public server load, map billing, sparse OSM data. Keep list-first fallback.
- **Definition of done:** User can find a station or receives a truthful, actionable failure state.

## Phase 5 — documents, richer analytics, and export

- **Objective:** Organize ownership records and provide a more complete vehicle cost picture.
- **Components:** Document metadata and private image handling, expiry alerts, search, vehicle-wise analytics, service-history export, estimated future expenses from plans, a recorded-maintenance readiness score with visible inputs, and a rule-based fuel-efficiency anomaly hint after enough valid segments. Optionally integrate a licensed city-price feed after permission and coverage checks.
- **Dependencies:** Phase 1 database; Phase 2 and 3 records/analytics; validated file APIs and any fuel-price rights.
- **Deliverables:** Searchable documents, expiry reminders, expense breakdown, and user-triggered export.
- **Acceptance criteria:** A document can be stored/reopened/deleted; expired metadata warns offline; export contains only the selected vehicle and uses user-controlled sharing; score and anomaly hints show their recorded inputs and never imply a mechanical diagnosis; price UI is absent or shows provenance and age.
- **Required tests:** File cleanup, expiry/date cases, export scope, aggregate no-double-count cases, permission denial and offline smoke tests.
- **Risks:** Local data loss on uninstall, sensitive file exposure via export, price licensing. Use non-sensitive demo files and clear share flow.
- **Definition of done:** Document and analytics flows are reviewable with correct privacy and source labels.

## Phase 6 — service bill intelligence (conditional)

- **Objective:** Reduce manual invoice entry while retaining human verification.
- **Components:** Compatible ML Kit bridge in Expo development build; image selection/capture; OCR text extraction; deterministic candidate parser; review/correction; service items and warranty entries; repeated-repair hint from matching recorded items.
- **Dependencies:** Phase 3 service model, Phase 5 private documents, validated Android/iOS bridge.
- **Deliverables:** One realistic receipt-to-reviewed-service workflow, or manual fallback if native integration fails.
- **Acceptance criteria:** Nothing persists without confirmation; bad OCR can be corrected; repeated-repair hint cites matching records and does not claim diagnosis.
- **Required tests:** Parser fixtures with Indian date/INR formats, incomplete receipts, transaction rollback, Android development-build test; iOS build/device test before claiming parity.
- **Risks:** Native build compatibility, OCR script/image accuracy, large app size. Defer rather than compromise the core milestone.
- **Definition of done:** The user can inspect and correct extracted fields, and saved records remain consistent.

## Phase 7 — optional cloud sync and genuine ML research

- **Objective:** Explore features only if time, consent, and evidence permit.
- **Components:** Separate Supabase sync design (auth, row security, opt-in, tombstones/conflicts); a model research plan with a suitable labelled dataset, baseline, held-out evaluation, and model card. Neither is required for the mini-project demo.
- **Dependencies:** Stable local schema, privacy review, sufficient data and development time.
- **Deliverables:** Design/prototype with evaluation evidence, not a marketing claim.
- **Acceptance criteria:** Sync never leaks another user's records; ML beats a documented deterministic baseline on held-out data and reports errors/limitations before being described as predictive.
- **Required tests:** Access-control and conflict tests for sync; reproducible train/test split and error analysis for ML.
- **Risks:** Data scarcity, privacy, cost, and scope creep.
- **Definition of done:** Implement only when these gates are met; otherwise record it as future work.
