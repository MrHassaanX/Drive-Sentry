# Phase 4B · Indian Fuel Prices

Open **Fuel → Indian Fuel Prices**. Mysuru is the default. Choose Delhi, Mumbai, Chennai or Kolkata to see the two metro reference prices, then choose Petrol or Diesel to filter the cards. Refresh prices asks for the latest published table. The source card links to the PPAC table and identifies the independent provider.

## Provider decision and coverage

| Source | What was verified | Integration |
| --- | --- | --- |
| [India Petroleum API](https://india-petroleum-api.vercel.app/docs) | The public, keyless `/v1/prices/latest`, `/v1/cities` and `/v1/meta` endpoints returned HTTP 200. The data traces to PPAC's Delhi, Mumbai, Chennai and Kolkata table. The service documents about 100 requests per 15 minutes per IP per server instance. | The app reads `/v1/prices/latest` for the entire table and credits PPAC next to the rates. |
| [API Mitra pricing and coverage](https://www.apimitra.in/api/fuel) | Its product page advertises 46 locations, a free monthly allowance, five morning updates and 90 days of history. Its [fuel schema](https://docs.apimitra.in/fuel/overview/) distinguishes city and state rows. The live city directory and Mysuru query required a key (HTTP 401). The [rate documentation](https://docs.apimitra.in/reference/rate-limits/) lists 60 fuel requests per minute and describes an older keyless model. The live service and current product page require authentication. | Mysuru and Karnataka response coverage, exact free allowance and applicable reuse terms need authenticated confirmation before this provider can be integrated. Its crawl timestamp alone would not establish a price effective date. |
| [PPAC metro source](https://ppac.gov.in/retail-selling-price-rsp-of-petrol-diesel-and-domestic-lpg/rsp-of-petrol-and-diesel-in-metro-cities-since-16-6-2017) | The published table describes IndianOil retail reference prices for four metros. Its [terms](https://ppac.gov.in/terms-conditions) require accuracy and prominent acknowledgement. Its [website policy](https://ppac.gov.in/website-policies) also discusses permission to reproduce portal materials. | The app displays the numerical prices from the documented public JSON API with PPAC attribution. It links to the source, and performs no site scraping or document redistribution. |
| IndianOil local price guidance | IndianOil's petrol and diesel price page describes a dealer-code SMS service. It identifies `RSP 118219` as a Bengaluru outlet example and advises using the dealer code at the relevant pump. | Mysuru and Bengaluru have an explicit unavailable state with text guidance for checking an outlet. Lookup remains a user action and the app asks for no SMS or location permission. |

The current price module requires no credentials or billing. Its numbers are published metro reference prices and can differ from the rate at an individual pump. It never substitutes a metro rate for a Karnataka city. No Karnataka state reference figure has been verified for this implementation. The source has a separate history endpoint, and the current screen omits day-on-day movement to avoid misrepresenting older revisions as daily changes.

## Data and freshness

The provider validates all eight fuel and city combinations and normalizes amounts to integer INR paise per litre. The effective date is the PPAC price date in India. The source publication date and the device retrieval timestamp are handled separately. The timestamp is stored in UTC and displayed in India Standard Time.

SQLite migration 6 adds `fuel_price_cache`, keyed by provider, city ID and fuel. The full metro table is saved in one atomic upsert and cannot be overwritten by an older publication. Existing migrations, garage data and station caches are preserved. A saved batch is current for six hours. Refresh bypasses the six-hour window while preserving the rate-limit cooldown. A failed refresh can use the last saved prices, marked stale with their original effective date and retrieval time. The screen also labels sources more than two Indian calendar days old. The provider call has a ten-second timeout, shares in-flight refreshes, uses a 30-second cooldown after transient failure and observes a minimum 15-minute HTTP 429 cooldown or a longer Retry-After.

## Verification

The 19 November 2026 API check returned the following values. The source date and effective date were both 18 November 2026.

| Metro | Petrol (₹/L) | Diesel (₹/L) |
| --- | ---: | ---: |
| Delhi | 102.12 | 95.20 |
| Mumbai | 111.21 | 97.83 |
| Chennai | 107.77 | 99.55 |
| Kolkata | 113.51 | 99.82 |

The [live latest response](https://india-petroleum-api.vercel.app/v1/prices/latest) and [provenance endpoint](https://india-petroleum-api.vercel.app/v1/meta) can advance independently of this dated record. PPAC's homepage also published the same Delhi figures for that date. Automated tests verify normalized dates and paise, invalid data, supported locations, rate limits, shared refreshes, expiry, saved data during an outage, protection against older publications, atomic batch writes and migration from version 5.

On `Medium_Phone_API_37.0` in Expo Go, the screen retrieved the Delhi rates, refreshed them, and showed the PPAC attribution, 18 November effective and source dates, and a separate 19 November retrieval time in IST. Mumbai, Chennai and Kolkata matched the live table and reused the saved batch. The Diesel filter hid the petrol card. Mysuru and Bengaluru showed outlet lookup guidance. With Wi-Fi and mobile data disabled and Android reporting no default network, refresh showed the stale saved Delhi rates and preserved the original retrieval timestamp. The original network and theme settings were restored.

Android verification screenshots captured Delhi online, Delhi in dark mode, Delhi offline, and the Mysuru unavailable state. The device runs used the live feed and its SQLite cache.

## Academic demonstration

1. Open the Fuel tab without selecting a vehicle and choose **Indian Fuel Prices**.
2. Show the Mysuru unavailable state and the IndianOil dealer-code guidance.
3. Choose Delhi, confirm both prices and the PPAC attribution, then switch to a different supported city and filter by Diesel.
4. Disconnect the emulator's internet and refresh after first obtaining a live reference table. Show the stale status and original retrieval timestamp. Restore the network and refresh again.
5. Return to the Fuel tab to show the independent station map and vehicle fuel records.

The price screen is designed for Android and iOS. iOS runtime remains unverified. Phase 4C premium or E0 verification remains future work.

The signed standalone `DriveSentryTesting.apk` loaded the live Delhi petrol and diesel figures with PPAC attribution. All five tabs opened. With emulator Wi-Fi and mobile data disabled, a cold restart loaded the same SQLite price rows and retrieval timestamp. Refresh showed **Stale saved prices** and retained both rates and the original timestamp. Automated migration tests also verify version 6 preserves the existing station cache and garage records.

The Expo Go regression run also verified disposable vehicle create, edit, active selection and removal. Two refills produced ₹4,500 total spend and 15.0 km/L. The saved refill data and overdue maintenance schedule survived a process restart. The original active vehicle was restored before removing the test vehicle. The final automated suite passed all 51 tests.
