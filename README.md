# DriveSentry 🚘

**Smart Vehicle Management System** · An academic project for car and motorcycle owners in India.

Track refills, fuel spending and service due dates for each vehicle. Plan fuel stops across India and keep your garage records on the device.

> [!IMPORTANT]
> **Phase 4 milestone · 65% complete**
>
> Phase 5 adds the Document Wallet and Ownership Analytics. Features may be added, revised or dropped as ideas and testing shape the next milestone.

## 🧰 What works today

| Area | What you can do |
| --- | --- |
| **Garage** | Manage multiple vehicles, switch between them, and keep each vehicle's history separate. |
| **Fuel log** | Record petrol, diesel or CNG refills, review spending, and calculate mileage from complete full-tank intervals. |
| **Maintenance** | Log services, plan future work, and see what's due by date or odometer. |
| **Fuel Map** | Search nearby or explore Indian cities, villages and PIN codes. Browse outlets on a map or list and open directions. |
| **Indian Fuel Prices** | Check dated outlet observations where available, plus PPAC-backed city references for Delhi, Mumbai, Chennai and Kolkata. |
| **E0 Explorer** | Look for ethanol-free petrol. Verified E0 requires dated evidence that identifies the outlet and fuel grade. |
| **Document Wallet** | Keep vehicle and owner documents with expiry warnings and optional local reminders. |
| **Ownership Analytics** | Record additional vehicle expenses, review saved costs, and export vehicle-specific CSV and PDF reports. |

> [!NOTE]
> SQLite keeps your garage records on-device. Station coverage varies by area and source. Outlet observations carry their dates, and city references apply at the city level. Confirm the price at the pump. Cached results can reopen offline while the basemap may require a connection.

## 🏁 Phase credits

| Phase | Delivered | Contributor |
| --- | --- | --- |
| **1 · Garage foundations** | Vehicle profiles, selection and local storage | [legend-codes](https://github.com/legend-codes) |
| **2 · Fuel tracking** | Refill history, spending and mileage | [legend-codes](https://github.com/legend-codes) |
| **3 · Maintenance** | Service records, schedules and due states | [MdUmairZ](https://github.com/MdUmairZ) |
| **4A · Fuel Map** | Station discovery, place search, map and directions | [MrHassaanX](https://github.com/MrHassaanX) |
| **4B · Fuel Prices** | Outlet observations and city reference prices | [MrHassaanX](https://github.com/MrHassaanX) |
| **4C · E0 Explorer** | Fuel-grade discovery and evidence rules | [MrHassaanX](https://github.com/MrHassaanX) |

## 🛣️ Remaining roadmap

| Plan | What's next |
| --- | --- |
| **Phase 6 · Invoice scanning** | If native OCR is reliable, extract service details from receipts and let the user review and correct them before saving. |
| **Phase 7 · Optional research** | Explore opt-in sync and investigate whether a suitable dataset can support a properly evaluated ML feature. |
| **Release validation** | Run cross-platform device checks, especially iOS, and verify offline behavior, upgrades and accessibility. |

[Original roadmap and acceptance criteria](docs/06_DEVELOPMENT_ROADMAP.md)

[Phase 5 ownership tools guide](docs/PHASE_5_OWNERSHIP.md)

## ▶️ Run locally

DriveSentry uses React Native, Expo SDK 58, Expo Router, TypeScript and Expo SQLite. With Node.js, pnpm and an Android emulator available:

```powershell
pnpm install --frozen-lockfile
pnpm start
```

Press `a` in the Expo terminal to open Android. Run `pnpm typecheck`, `pnpm lint` and `pnpm test` to check changes. Core workflows have Android emulator coverage. iOS runtime testing is pending.

For the Windows presentation, `./scripts/College-Demo.ps1 -UseWindowsLocation` opens Fuel Map in Expo Go with a Windows location estimate synced to the emulator. The app identifies it as simulated. See the [demo launcher and build guide](docs/FUEL_ASSISTANT_V3.md#build-and-launch).

## 📚 Project docs

[Phase 0 design and reconciliation](docs/PHASE0_RECONCILIATION.md) · [Phases 1–3 verification](docs/PHASE_1_3_AUDIT.md) · [Fuel Assistant, providers and build profiles](docs/FUEL_ASSISTANT_V3.md) · [Data attribution](THIRD_PARTY_NOTICES.md) · [Contributor guide](AGENTS.md)
