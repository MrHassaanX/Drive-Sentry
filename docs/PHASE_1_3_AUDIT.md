# DriveSentry Phase 1–3 audit

Starting point `f706dc9581a3a220d1fc5b38801f5a63fb1131c7` on `fix/phase-1-3-stabilization`. The [Phase 0 reconciliation](PHASE0_RECONCILIATION.md) explains where the original proposals differ from the implementation.

| Phase | Verified by automation | Repairs from source review and regression tests | Device verification pending |
| --- | --- | --- | --- |
| 1 · Foundation | Vehicle validation and CRUD, persisted selection, cascade deletion, foreign keys, Android route bundling | Made database startup errors recoverable by rendering the retry view outside the SQLite provider. Distinguished failed or loading garage queries from an empty garage, corrected destructive-action copy and stale phase labels, and let the tab bar size itself and hide with the keyboard. | Android navigation, restart persistence, startup retry UI, light/dark readability, layout and keyboard behavior. |
| 2 · Fuel | Refuelling CRUD and isolation, chronological checks, full and partial fills, CNG units, paise, monthly and lifetime spending, and profile fuel-type changes | Mileage now checks both full-tank boundaries and intervening fills for matching fuel types and units. New entries retain their recorded type across profile edits. SQLite enforces chronological consistency at the write, including competing saves. Scoped detail and deletion queries by vehicle. Focused loads cannot show another vehicle’s prior results. | Fuel form interactions, immediate refresh across tabs, and switch behavior on Android. |
| 3 · Maintenance | Schedule and record operations, date/distance/combined due states, month ends and leap years, forecast history, schedule reassignment, service editing/deletion, and exact paise parsing | Stopped overwriting configured baselines. Active baselines come from the latest completed linked service or a confirmed fallback. Record writes are single SQLite statements. Home and Maintenance share the due calculation, use local fuel-log dates for forecasts, and display load errors distinctly. | End-to-end schedule editing and recovery, dashboard agreement after navigation, and in-app alert presentation. |

## Data rules and recovery

- The manually entered profile odometer is separate from the latest dated fuel reading. Home and Fuel label both when available. Maintenance takes the higher of the two for distance checks. Forecasts use rising, nondecreasing fuel-log readings spanning at least seven days. Recorded data, including historical readings, stays as entered unless the user edits the corresponding record.
- The old repository wrote the latest completed service into the schedule’s stored baseline. Changing it to planned did not consistently refresh the baseline. Deleting a latest service with an earlier completed service already worked. Deleting or moving the final completed service left stale data. The schedule read now picks the latest completed service by date and ID. Editing, moving, planning, or deleting a service updates that result without any separate schedule write.
- Version 4 preserves all rows and migrations 1–3. Existing version 3 baseline values are retained but flagged as unconfirmed because version 3 could overwrite them without keeping the original. A completed linked record still supplies the active baseline. When no completed record exists, the app displays **Needs baseline** until the owner enters a known fallback in the schedule editor. The app never recovers a missing reading by guessing.
- Version 4 leaves old fuel types unknown because version 3 stored only units. Mileage between legacy entries with matching units remains available as a recorded-data estimate. A segment cannot cross from legacy unknown to a known fuel type, or between different known types. An omitted refill cannot be detected from the remaining records alone.
- Date and distance due states appear in the app. OS notifications, standalone expenses, documents, live integrations and EV charging are outside the delivered scope.

## Validation

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed with the existing lockfile. The sandboxed attempt could not resolve the registry. A network-enabled retry succeeded. |
| `pnpm typecheck` | Passed. |
| `pnpm lint` | Passed with Expo telemetry disabled for the session because its profile directory is outside the workspace. |
| `pnpm test` | 32 passed. SQLite fixtures cover initial installation and upgrades from versions 1, 2 and 3, preserved data, isolation and foreign keys. |
| `pnpm exec expo install --check` | Passed. Installed dependencies match the SDK. |
| `pnpm exec expo export --platform android` | Passed. Metro produced an Android bundle in `dist/`. |
| `git diff --check` | Passed. |

The original test run failed to load the SQLite integration suite because a maintenance import lacked its `.ts` extension. After fixing the import, regression tests reproduced the mixed-unit mileage error, stale baseline after replanning, and the service write followed by a separate schedule-update failure. Android Studio, an Android SDK and an emulator were unavailable on this host. iOS runtime testing was also unavailable.

## Windows emulator smoke test

1. Install Android Studio and use SDK Manager to install Android SDK Platform-Tools and Android Emulator. Set `ANDROID_HOME` to the SDK location. Use Device Manager to create and boot a phone AVD with a supported Android image. Confirm `adb devices` shows the emulator as `device`. See the [Expo Android emulator setup](https://docs.expo.dev/workflow/android-studio-emulator/).
2. From the repository root run `pnpm install --frozen-lockfile` and `pnpm android`. Open the SDK-compatible Expo Go build on the AVD if prompted. Verify all five tabs, details, edit routes, cancel and back actions. Switch system light/dark mode, use a small AVD, and scroll forms to Save with the keyboard open.
3. Create a petrol car and CNG vehicle using sample data. Try a blank required field, save valid profiles, select one, reload the app without clearing its data, and verify selection. Delete a disposable vehicle with both fuel and maintenance records and verify the other vehicle’s data remains.
4. On one vehicle, enter full at 10,000 km, partial 10 L at 10,100 km, and full 20 L at 10,300 km, using increasing past dates. Expect `10 km/L`. Edit the partial quantity, check the change on Fuel and Home, then delete the mistaken entry and check recalculation. Reject a backwards reading. Verify CNG uses kg and that switching vehicles changes all totals.
5. Create a schedule with a known fallback date/odometer. Add two completed linked services with different dates, mark the latest planned, restore it, and delete it. Expect the earlier completed record to govern. Move the last service to another schedule and confirm both schedules. Delete it and check fallback recovery. For an upgraded version 3 fixture with an unconfirmed fallback, expect **Needs baseline** after the last completed service is removed. Check Home and Maintenance for the same due states.
6. Restart the app, verify the records and active vehicle persist, and note any differences in UI or runtime behavior. Complete this test before treating Phases 1–3 as ready for Phase 4.
