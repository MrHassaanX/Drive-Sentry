# DriveSentry contributor rules

- Read `README.md`, relevant source files, and [Phase 0 reconciliation](docs/PHASE0_RECONCILIATION.md) before changing behavior. The seven Phase 0 docs are proposals; `src/db/migrations.ts` and released migrations are the current schema contract. Update design docs alongside intentional future changes without rewriting old migrations.
- Keep the app local-first and compatible with Android and iOS. Keep React Native + Expo, Expo Router, strict TypeScript, Expo SQLite, native UI, React Context, and hooks. Do not add authentication, a backend, APIs, OCR, maps, or Phase 4 features without an explicit task.
- Follow the existing layout: routes in `src/app/`, UI in `src/components/`, SQLite setup in `src/db/`, and feature logic/repositories in `src/features/`. Keep calculations and validation out of route components. Repositories own SQL and use parameterized statements.
- Check the installed Expo SDK in `package.json` and its matching documentation before changing dependencies. Use `pnpm exec expo install <package>` for Expo-compatible modules. Configure native behavior through Expo app config/plugins; do not create or hand-edit `android/` or `ios/` projects casually.
- Scope vehicle-owned reads and writes by vehicle ID; validate input before writes. Keep foreign-key enforcement on and use supported transactions for related mutations. Migrations must preserve existing records; never reset a user's database to solve an upgrade problem.
- Respect current units: INR as integer paise, fuel quantity as integer thousandths of a **litre or kilogram** according to `quantity_unit`, and odometer as integer kilometres. Keep user-entered historical readings intact. Resolve cross-module current-odometer policy explicitly before changing it.
- Calculate fuel economy only from valid consecutive full-tank boundaries and complete intervening logged refills. Do not describe rules or OCR as a trained vehicle-health model. Never claim tank level, mechanical health, or odometer telemetry without a real source.
- Ask for optional location, image, camera, and notification permissions only when the relevant future feature needs them. Keep external data optional, attributed, and labelled with coverage and freshness. City reference prices are not pump prices.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` before declaring code changes complete. Add focused regression tests for corrected behavior and migration tests from supported versions. Record Android emulator results and mark iOS runtime behavior untested unless actually checked.
- Preserve contributor history and author identities. Do not commit, push, merge, or change the default branch as part of a read-only review or without the relevant task authorization.

## DriveSentry workspace isolation

- Keep source, dependencies, logs, downloads, scratch data, and build outputs inside the assigned DriveSentry workspace. Use the ignored `.local/` and `.expo/` directories for local artifacts. Never create DriveSentry files or directories directly under `D:\`.
- Keep project dependencies and build artifacts separate from other projects. Change other workspaces only with explicit authorization.
- For Windows native path limits, use a verified temporary drive mapping backed by a directory inside this workspace. Release the mapping in cleanup and retain failed build diagnostics in the workspace.
- Preserve source, signed APKs, signing keys, credentials, and application data. Check ownership, active use, and reparse points before removing temporary artifacts. Leave personal and unidentified data alone.
- Keep emulator data unless explicitly authorized to clear it. Start new phases only when requested.
