# Academic demonstration and evaluation

> **Original Phase 0 demo proposal (13 November 2026).** Several scenarios below are not implemented. See the [reconciliation](PHASE0_RECONCILIATION.md), then base any submission demo on verified code and tests.

## Project case

**Title:** Smart Vehicle Management System (DriveSentry). The practical problem is fragmented ownership records: bills, fuel purchases, service dates, and insurance/PUC expiry dates are easy to lose or forget. For Indian owners, INR spending and local petrol/diesel context make the problem concrete. A software-only phone app lowers the entry barrier because it needs no OBD device or hardware modification.

Compared with a manual spreadsheet, DriveSentry adds vehicle-scoped validation, full-tank-aware efficiency calculations, date/distance due logic, reminders, private document organization, and optionally location-based station discovery. The value comes from correct automation and explanation, not from a high screen count. The design also demonstrates modularity, separation of UI/domain/data access, persistent storage, migration discipline, error handling, permission minimization, and tests.

## Honest mid-project demonstration

Target the functional gate after Roadmap Phase 3. Prepare two fictitious vehicles, such as a petrol motorcycle and a diesel car, with clearly fictional non-sensitive records. On the emulator:

1. Launch, add both vehicles, restart, and show persistence plus vehicle switching.
2. Enter a full-tank purchase, a partial purchase, and a later full-tank purchase with increasing odometer values. Show the exact litres included and compute the full-to-full km/L manually alongside the app. Show that a partial-only sequence says “insufficient data.”
3. Add a standalone expense and show monthly fuel and other costs without double-counting a service bill.
4. Create a maintenance plan due by date or kilometre, show an overdue dashboard alert, then record completion and show the advanced threshold.
5. Deny notifications or disable network and show that the in-app due state and local records still work. If Phase 4 passed its gate, optionally show nearby stations with OSM attribution and dated cache state.

Present a short architecture diagram, schema entities, validation rules, and the actual test results. Describe this as a substantial core slice, **not an asserted “50%” based on arbitrary screen count**. State remaining features: documents, broader analytics/export, station and price integration, OCR, warranty/repeated repair, iOS verification, sync, and ML research.

## Evaluation plan

| Question | Demonstration evidence | Measure |
| --- | --- | --- |
| Do records survive and stay separated by vehicle? | Add/edit two vehicles and records; restart and switch. | Correct record counts and no cross-vehicle leakage. |
| Is mileage defensible? | Known full/partial/full fixture and invalid sequence. | Computed km/L matches independent hand calculation; invalid case shows no number. |
| Are costs accurate? | Fuel, service, and standalone expense fixtures. | Sum matches three sources exactly once, within paise rounding. |
| Do service reminders respond to both thresholds? | Date-due, distance-due, completion fixtures. | Correct due status and next threshold after completion. |
| Does the app function offline and without permissions? | Disable network/deny location and notifications. | Core CRUD and in-app alerts remain usable; online views explain failure. |
| Are claims honest? | Inspect labels and source dates. | No unsupported health/tank/odometer/live-pump-price claims. |

Capture emulator screenshots or a short recording and list executed test commands/results for the submission. Do not fabricate pass counts. If a planned integration is not ready, show its design and limitation rather than a fake live result.

## AI/ML classification

| Feature | Actual method | Claim permitted |
| --- | --- | --- |
| Fuel economy, cost/km, monthly expense, due intervals, usage-rate forecast, anomaly threshold, readiness score | Deterministic arithmetic and rules on user-entered facts | Explainable estimates/alerts; no trained AI claim. |
| Receipt OCR, if ML Kit integration is implemented | Third-party pretrained on-device ML text recognizer | “ML-assisted text recognition,” with user verification; field parsing may still be rules. |
| Future maintenance prediction model | Would require a labelled dataset, documented features, training, independent test split, baseline comparison, error analysis, and privacy review | “Predictive ML” only after the model is actually built and evaluated. |

A defensible future AIML project might predict probability of a recorded maintenance event in a future interval using consented, anonymized service and mileage histories. It must avoid claiming mechanical failure detection without diagnostic ground truth. With only a few personal logs, a rule-based forecast is more honest and useful than training a weak model.

## Social usefulness and limits

Timely reminders can reduce missed routine maintenance and expired documents; cost history can help owners budget. These are plausible benefits to evaluate with user tasks or survey feedback, not measured outcomes at Phase 0. Data is manually entered and can be incomplete or wrong. City prices differ from station prices, OSM coverage varies, OS notification delivery can be delayed, and local-only data can be lost if the app is removed. State these limits during the demo.
