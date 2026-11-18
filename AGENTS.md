# DriveSentry contributor rules

- Keep the app local-first and compatible with Android and iOS. Do not add authentication, a backend, APIs, OCR, maps, or later-phase features without an explicit task.
- Follow the feature-based layout: routes in `src/app/`, reusable native UI in `src/components/`, SQLite setup in `src/db/`, and feature logic/repositories in `src/features/`.
- Keep calculations and validation out of screen components. Screens call feature modules; repositories own SQL access and use parameterized statements.
- Check the installed Expo SDK in `package.json` and its matching versioned Expo documentation before using Expo or React Native APIs. Use `pnpm exec expo install <package>` for Expo modules so the SDK-compatible version is selected.
- Do not create or hand-edit `android/` or `ios/` native projects. Configure native behavior through Expo app config and supported config plugins.
- Keep TypeScript strict. Avoid `any`, fabricated metrics, and claims that an unimplemented feature is available.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` before declaring implementation work complete. Add focused tests for pure domain rules and validate schema changes.
- Keep database migrations versioned and preserve existing user data. Never reset a user's database as part of a migration.
