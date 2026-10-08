# WhatsApp message for Aiosell support (English)

> Internal note — verified 2026-10-06 against `https://live.aiosell.com/api/v2/cm`:
>
> | Call | Result | Meaning |
> |---|---|---|
> | username **lowercase** `volkern-hospitality` + password, `partnerId=volkern-hospitality` | **403 `Access Denied - 75fdbbce2e`** | credentials OK · hotel NOT granted |
> | same username + **wrong password** | 400 `Authentication Required!` | proves the correct password PASSES auth |
> | username `Volker-Hospitality` (capitalised) + correct password | 400 `Authentication Required!` | **username is case-sensitive: must be lowercase** |
> | `partnerId=test` / `Volker-Hospitality` / `75fdbbce2e` | 400 `Partner is disabled!` | wrong partnerId values are rejected |
> | `partnerId=volkern-hospitality` + `sandbox-pms` | 403 `Access Denied - sandbox-pms` | the test hotel is not granted either |
>
> Conclusions: the pair `volkern-hospitality / <password>` is **valid** and the partnerId `volkern-hospitality`
> is correct; the partner simply has **no hotel assigned** (every hotel answers 403 Access Denied).
> The ERP panel must store the username in lowercase and this partnerId.
> Do NOT send credentials over chat. India is IST (UTC+5:30) — best window 03:30–09:30 UTC.

---

## Main message (copy-paste)

Hi team, good news on our side — our credentials now authenticate correctly, so we are closer:

- GET /api/v2/cm/property_details/75fdbbce2e?partnerId=volkern-hospitality → HTTP 403 {"success": false, "message": "Access Denied - 75fdbbce2e"}
- The same call with a wrong password → HTTP 400 "Authentication Required!" — so our username/password do pass authentication.

The same 403 happens with your test hotel (sandbox-pms), so it looks like partner **volkern-hospitality** currently has **no hotels assigned**.

Could you please:
1. Grant partner `volkern-hospitality` access to our hotel `75fdbbce2e` (and confirm this is the right hotelID for our account).
2. Once granted, confirm that `GET /property_details/75fdbbce2e?partnerId=volkern-hospitality` should return 200 with the room/rateplan catalog, so our catalog sync and reconciliation can resume.

Our calls have been failing since Oct 1, so this is the last piece. Thank you!

---

## Ultra-short version (if you prefer 4 lines)

Hi team, our credentials authenticate fine now (wrong password gives "Authentication Required!", ours gets past it).
But property_details returns HTTP 403 "Access Denied - 75fdbbce2e" for our hotel, and the same with sandbox-pms — partner volkern-hospitality seems to have no hotels assigned.
Could you grant us access to hotel 75fdbbce2e and confirm it is the right hotelID? Thanks!
