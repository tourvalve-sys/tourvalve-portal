# Testing the Travelport Endpoint with Postman

This app ships built-in raw-SOAP passthrough controllers meant exactly for manual testing like this. This guide has three parts:

1. **General request format** — how any Travelport SOAP request is shaped (envelope, auth, headers), so you can build new requests beyond the examples here.
2. **General testing guide** — when/how to test through the local app vs. straight against Travelport.
3. **API reference** — a Swagger-style entry for every endpoint: method, headers, request body, response.

Everything here is pulled from the actual code (`TravelportAirClient.cs`, `TravelportSoapClient.cs`, `TravelportBasicAuthHandler.cs`, `TravelportTestController.cs`, `TravelportAirController.cs`, `TravelportTerminalController.cs`, `DebugController.cs`), not generic Travelport documentation — it reflects exactly what this codebase does today.

---

## Part 1 — General Guide: How a Travelport Request Is Formatted

Every Travelport uAPI call, regardless of operation, is an HTTP `POST` carrying a **SOAP 1.1 envelope** as the body. The shape is always:

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ...>
  <soapenv:Header>
    <!-- auth goes here, IF using WS-Security (see below) -->
  </soapenv:Header>
  <soapenv:Body>
    <!-- the actual operation, e.g. <air:LowFareSearchReq>...</air:LowFareSearchReq> -->
  </soapenv:Body>
</soapenv:Envelope>
```

### 1.1 The operation element

Inside `<soapenv:Body>` sits exactly one element naming the operation, e.g. `LowFareSearchReq`, `AirPriceReq`, `AirCreateReservationReq`, `AirTicketingReq`, `UniversalRecordRetrieveReq`, `PingReq`. Each belongs to a specific XML namespace and a specific Travelport **service** (see table below) — sending the right element to the wrong service will fail.

| Travelport service | Typical operations | XML namespace (version may vary) |
|---|---|---|
| `SystemService` | `PingReq` | `http://www.travelport.com/schema/system_v32_0` |
| `AirService` | `LowFareSearchReq`, `AirPriceReq`, `AirTicketingReq` | `http://www.travelport.com/schema/air_v51_0` |
| `UniversalRecordService` | `AirCreateReservationReq`, `UniversalRecordRetrieveReq` | `http://www.travelport.com/schema/universal_v51_0` |
| `TerminalService` | host/terminal commands (e.g. `HMLD`) | (handled internally by `TravelportTerminalService`, not sent as raw XML) |

Almost every operation element also carries common attributes worth knowing:
- `TargetBranch` — your Travelport agency branch code (from `appsettings.json` → `Travelport:TargetBranch`).
- `TraceId` — any string you choose, echoed back in the response; useful to correlate requests when debugging.
- `AuthorizedBy` — usually your username without the `Universal API/` prefix.
- A `<com:BillingPointOfSaleInfo OriginApplication="UAPI"/>` element is typically required as the first child of the body.

### 1.2 The two authentication styles — never mix them

Travelport rejects a request that carries **both** an HTTP Basic `Authorization` header **and** a WS-Security header in the same call. Pick one:

**Style 1 — HTTP Basic Auth** (simpler; no SOAP header needed)
- `Authorization: Basic <base64(Universal API/<username>:<password>)>`
- Leave the SOAP `<soapenv:Header>` empty (or omit it).
- Used by this app's `TravelportSoapClient` (→ `AirSearchService`, `AirPriceService`, `AirBookService`, and the raw `/ping` action).

**Style 2 — WS-Security `UsernameToken`** (auth lives inside the XML, not the HTTP header)
```xml
<soapenv:Header>
  <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" soapenv:mustUnderstand="1">
    <wsse:UsernameToken>
      <wsse:Username>Universal API/YOUR_USERNAME</wsse:Username>
      <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">YOUR_PASSWORD</wsse:Password>
    </wsse:UsernameToken>
  </wsse:Security>
</soapenv:Header>
```
- No `Authorization` HTTP header.
- Used by this app's `TravelportAirClient` (→ the `api/travelport-test/*` harness), which auto-generates this header for you if you don't supply a full envelope.

In both styles, the username is `Universal API/<your username>` — Travelport requires that literal prefix; the app adds it automatically if your configured username doesn't already contain a `/`.

### 1.3 Common HTTP headers

| Header | Value | Notes |
|---|---|---|
| `Content-Type` | `text/xml` | Always, for the outbound call to Travelport itself |
| `Accept` | `text/xml` | Recommended |
| `SOAPAction` | Either the full action URL (e.g. `http://www.travelport.com/schema/air_v51_0/LowFareSearchReq`) or a blank string `""` | Some Travelport services accept a blank `SOAPAction` for everything; others expect the real action URL. This app sends blank for Style-1 calls and the real action URL for Style-2 calls — match whichever style you're using. |
| `Authorization` | See §1.2 | Only for Style 1 |

### 1.4 Endpoint URLs

From `backend/TourValve.Api/appsettings.json` → `Travelport` section:

| Service | Config key | Example value (APAC region) |
|---|---|---|
| System | `SystemEndpoint` | `https://apac.universal-api.pp.travelport.com/B2BGateway/connect/uAPI/SystemService` |
| Air | `AirEndpoint` | `https://apac.universal-api.pp.travelport.com/B2BGateway/connect/uAPI/AirService` |
| Universal Record | `UniversalEndpoint` | `https://apac.universal-api.pp.travelport.com/B2BGateway/connect/uAPI/UniversalRecordService` |
| Terminal | `TerminalEndpoint` | `https://apac.universal-api.pp.travelport.com/B2BGateway/connect/uAPI/TerminalService` |

---

## Part 2 — General Guide: Local Endpoint vs. Travelport Endpoint

There are two ways to run any test in this guide. Decide which one you need first:

| | **Local endpoint** (through the app) | **Travelport endpoint** (direct) |
|---|---|---|
| What you're actually testing | The app's request-building/parsing logic, end-to-end, using its own configured credentials | Travelport connectivity/credentials in isolation, independent of any app code |
| Auth | Handled for you by the app | You build/send it yourself (Style 1 or 2, per §1.2) |
| Envelope | Usually just the inner operation element — the app wraps it | You must send the full `<soapenv:Envelope>` yourself |
| When to use | Day-to-day development/debugging of this app's Travelport integration | Confirming "is it my credentials/network" vs. "is it my code" when something fails |
| Requires the backend running locally? | Yes (`dotnet run` in `backend/TourValve.Api/`) | No |

### 2.1 Testing via the local endpoint — general steps

1. Run the backend: `dotnet run` from `backend/TourValve.Api/`. Base URL is `https://localhost:7274` (or `http://localhost:5274`), per `Properties/launchSettings.json`.
2. Make sure real Travelport credentials are filled into `appsettings.Development.json` (or `appsettings.json`) — not still `CHANGE_ME`. Sanity-check with `GET /api/debug/travelport-auth` (see Part 3).
3. If Postman complains about the local HTTPS dev certificate, either use the `http://` URL, or turn off **Settings → General → SSL certificate verification** in Postman (local testing only).
4. Pick an endpoint from Part 3 §3.1. Most accept `{"xml": "<inner operation element>"}` as a JSON body — you generally do **not** need to build the envelope or set auth headers yourself; the app does it.
5. None of the `api/travelport/air/*` or `api/travelport-test/*` endpoints require a TourValve login — no `[Authorize]` on those controllers. `api/travelport-terminal/*` does require a JWT (see §3.1).

### 2.2 Testing via the Travelport endpoint directly — general steps

1. Pick the right service URL from §1.4 for the operation you're testing.
2. Pick one auth style from §1.2 and build the request accordingly — Basic Auth header with a bare envelope, or a WSSE header inside the envelope. Don't mix them.
3. Set `Content-Type: text/xml` and `SOAPAction` per §1.3.
4. Send the full envelope (Part 1) as the raw request body.
5. A `200 OK` with a SOAP XML body back (not a 401, not an HTML error page) confirms your credentials/`TargetBranch`/network path all work, independent of anything in this app's code.

### 2.3 Postman setup tips

- Create a Postman **environment** with variables: `localBaseUrl` (`https://localhost:7274`), `travelportSystemEndpoint`, `travelportAirEndpoint`, `travelportUniversalEndpoint`, `travelportTerminalEndpoint`, `travelportUsername`, `travelportPassword`, `targetBranch` — then reference them as `{{travelportAirEndpoint}}` etc. so you can flip between local and direct testing without rewriting requests.
- For Style 1 (Basic Auth) requests, use Postman's **Authorization tab → Basic Auth** rather than hand-building the header — Postman computes the Base64 for you and it's easy to get wrong by hand.
- Save a working `PingReq` request first (§3.2) before attempting anything more complex — it's the fastest way to confirm connectivity and credentials with zero booking-domain complexity.

---

## Part 3 — API Reference

### 3.1 App endpoints (local)

---

#### `GET /api/debug/travelport-auth`

**Auth required:** No
**Headers:** None required
**Request body:** None

**Response `200 OK`** (`application/json`):
```json
{
  "username": "Universal API/YOUR_USERNAME",
  "passwordLength": 12,
  "passwordLast2": "xx",
  "basicBase64_First10": "VW5pdmVyc2",
  "basicBase64_Last10": "M0NUZ3PT0="
}
```
**Notes:** Never returns the real password — only its length, last 2 characters, and the first/last 10 characters of the computed Base64 Basic-auth token. Use this to confirm config actually loaded before testing anything else. If `username`/`passwordLength` look like placeholder values (e.g. `CHANGE_ME`, length 0), credentials weren't filled in.

---

#### `GET /api/debug/last-booking-raw`

**Auth required:** No
**Headers:** None required
**Request body:** None

**Response `200 OK`** (`application/json`): the last captured raw booking debug payload (written by `AirBookingController` during a live `AirCreateReservationReq` attempt) — request XML, response XML, and any error, whichever stage it got to.
**Response `404 Not Found`**:
```json
{ "error": "No booking debug payload has been captured yet." }
```

---

#### `GET /api/travelport/air/ping`

**Auth required:** No
**Headers:** None required
**Request body:** None

**Behavior:** Sends a hardcoded `PingReq` to `SystemEndpoint` using **Style 1 (Basic Auth)** — no envelope-building needed on your end.

**Response `200 OK`**: raw Travelport SOAP response body (as plain text, or as a JSON-encoded string depending on content negotiation — if you see literal `\n`/`\"` in the response, it's JSON-encoded; unescape to read the XML).
**Response `500`**: Travelport connection/auth error, with the exception message as the body.

---

#### `POST /api/travelport/air/system-ping`

**Auth required:** No
**Headers:** `Content-Type: application/json`
**Request body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `xml` | string | Yes | A **full SOAP envelope** (Style 1 — no WS-Security needed; Basic Auth is added automatically) |

Example:
```json
{
  "xml": "<SOAP:Envelope xmlns:SOAP=\"http://schemas.xmlsoap.org/soap/envelope/\"><SOAP:Body><sys:PingReq xmlns:sys=\"http://www.travelport.com/schema/system_v32_0\" TraceId=\"postman-test\"><sys:Payload>ping</sys:Payload></sys:PingReq></SOAP:Body></SOAP:Envelope>"
}
```
**Response `200 OK`**: raw Travelport SOAP response.

---

#### `POST /api/travelport/air/search`

**Auth required:** No
**Headers:** `Content-Type: application/json`
**Request body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `xml` | string | Yes | A **full SOAP envelope** wrapping a `LowFareSearchReq` (Style 1 — Basic Auth added automatically; no WSSE needed) |

**Behavior:** Forwards to `AirEndpoint` via `AirSearchService.SearchAsync` → `TravelportSoapClient` (blank `SOAPAction`).

**Response `200 OK`**: raw Travelport SOAP response containing fare/itinerary results.
**Response `500`**: HTTP error status + Travelport's raw error body, if the call failed.

---

#### `POST /api/travelport/air/price`

**Auth required:** No
**Headers:** `Content-Type: application/json`
**Request body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `xml` | string | Yes | A **full SOAP envelope** wrapping an `AirPriceReq` (Style 1) |

**Behavior:** Forwards to `AirEndpoint` via `AirPriceService.PriceAsync`.
**Response `200 OK`**: raw Travelport SOAP response with the priced solution.

---

#### `POST /api/travelport/air/reservation`

**Auth required:** No
**Headers:** `Content-Type: application/json`
**Request body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `xml` | string | Yes | A **full SOAP envelope** wrapping an `AirCreateReservationReq` (Style 1) |

**Behavior:** Forwards to `UniversalEndpoint` via `AirBookService.CreateReservationAsync`. **This creates a real PNR against your live Travelport branch if credentials are live** — only send a request you intend to actually book.
**Response `200 OK`**: raw Travelport SOAP response with the created Universal Record / PNR locators.

---

#### `POST /api/travelport-test/ping`

**Auth required:** No
**Headers:** `Content-Type: application/json`
**Request body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `xml` | string | Yes | Either a bare `PingReq` element (auto-wrapped with WS-Security, Style 2) or a full envelope (sent as-is) |

**Behavior:** Forwards to `SystemEndpoint` via `TravelportAirClient.PostToSystemServiceAsync` (no `SOAPAction` header set).
**Response `200 OK`**: raw Travelport SOAP response.

---

#### `POST /api/travelport-test/air`

**Auth required:** No
**Headers:** `Content-Type: application/json`
**Request body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `xml` | string | Yes | A bare `<air:LowFareSearchReq>` element (auto-wrapped with WS-Security) |

Example:
```json
{
  "xml": "<air:LowFareSearchReq xmlns:air=\"http://www.travelport.com/schema/air_v51_0\" xmlns:com=\"http://www.travelport.com/schema/common_v51_0\" TargetBranch=\"YOUR_TARGET_BRANCH\" TraceId=\"postman-search-1\"><com:BillingPointOfSaleInfo OriginApplication=\"UAPI\"/><air:AirSearchModifiers><air:PreferredProviders><air:Provider Code=\"1G\"/></air:PreferredProviders></air:AirSearchModifiers><air:SearchAirLeg><air:SearchOrigin><com:Airport Code=\"KUL\"/></air:SearchOrigin><air:SearchDestination><com:Airport Code=\"SIN\"/></air:SearchDestination><air:SearchDepTime PreferredTime=\"2026-08-01T00:00:00\"/></air:SearchAirLeg><air:AirSearchAsynchronous Value=\"false\"/><com:SearchPassenger Code=\"ADT\"/></air:LowFareSearchReq>"
}
```
**Behavior:** Forwards to `AirEndpoint` via `TravelportAirClient.PostToAirServiceAsync` with `SOAPAction: http://www.travelport.com/schema/air_v51_0/LowFareSearchReq`.
**Response `200 OK`**: raw Travelport SOAP response with search results. See `AirSearchService`/`FlightController` for the fuller request shape this app builds at runtime (multi-city, cabin preferences, etc.).

---

#### `POST /api/travelport-test/price`

**Auth required:** No
**Headers:** `Content-Type: application/json`
**Request body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `xml` | string | Yes | A bare `<air:AirPriceReq>` element (auto-wrapped with WS-Security) |

**Behavior:** Forwards to `AirEndpoint` with `SOAPAction: http://www.travelport.com/schema/air_v51_0/AirPriceReq`.
**Response `200 OK`**: raw Travelport SOAP response with the priced itinerary.

---

#### `POST /api/travelport-test/book`

**Auth required:** No
**Headers:** `Content-Type: application/json`
**Request body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `xml` | string | Yes | A bare `<univ:AirCreateReservationReq>` element (auto-wrapped with WS-Security) |

**Behavior:** Forwards to `UniversalEndpoint` with `SOAPAction: http://www.travelport.com/schema/universal_v51_0/AirCreateReservationReq`. See `AirBookingController.BuildReservationRequest` for the exact shape this app sends in production, including the `ActionStatus Type="TAW"` workaround needed to avoid Travelport error 7228. **Creates a real PNR if credentials are live.**
**Response `200 OK`**: raw Travelport SOAP response with the Universal Record/PNR locators.

---

#### `POST /api/travelport-test/retrieve`

**Auth required:** No
**Headers:** `Content-Type: application/json`
**Request body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `xml` | string | Yes | A bare `<univ:UniversalRecordRetrieveReq>` element (auto-wrapped with WS-Security) |

**Behavior:** Forwards to `UniversalEndpoint` with `SOAPAction: http://www.travelport.com/schema/universal_v51_0/UniversalRecordRetrieveReq`.
**Response `200 OK`**: raw Travelport SOAP response with the full PNR contents.

---

#### `POST /api/travelport-test/ticket`

**Auth required:** No
**Headers:** `Content-Type: application/json`
**Request body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `xml` | string | Yes | A bare `<air:AirTicketingReq>` element (auto-wrapped with WS-Security) |

**Behavior:** Forwards to `AirEndpoint` with `SOAPAction: http://www.travelport.com/schema/air_v51_0/AirTicketingReq`. **Issues a real ticket against a real PNR if credentials are live** — only send this against a booking you intend to actually ticket.
**Response `200 OK`**: raw Travelport SOAP response confirming ticket issuance (or a fault if the PNR isn't ticketable yet).

---

#### `POST /api/travelport-terminal/hmld`

**Auth required:** **Yes** — `Authorization: Bearer <TourValve JWT>` (get one via `POST /api/auth/login` first)
**Headers:** `Content-Type: application/json`, `Authorization: Bearer <token>`
**Request body:**
| Field | Type | Required | Description |
|---|---|---|---|
| `host` | string | No (defaults to `"1G"`) | A GDS host code matching `^1[A-Z]$`, e.g. `1G`, `1V`, `1P` |

Example:
```json
{ "host": "1G" }
```
**Response `200 OK`** (`application/json`):
```json
{
  "host": "1G",
  "command": "HMLD",
  "transactionId": "...",
  "traceId": "TV-HMLD-...",
  "responseMessages": ["..."],
  "text": "...",
  "rawTerminalResponseXml": "<...>"
}
```
**Response `400 Bad Request`**:
```json
{ "error": "Invalid host. Example: 1G" }
```
**Notes:** Runs an `HMLD` (host linkage display) command through `TravelportTerminalService` — useful to confirm your GDS host/branch is reachable, distinct from the Air/System/Universal services above.

---

### 3.2 Travelport SOAP services (direct)

These aren't "endpoints this app defines" — they're Travelport's own services, called directly with no app in between. Use Part 1/Part 2 to build the request; this table just anchors method/URL/auth style per operation.

| Operation | Method | URL (config key) | Auth style | `SOAPAction` |
|---|---|---|---|---|
| Ping | `POST` | `SystemEndpoint` | Either | Blank (Style 1) or full action URL (Style 2) |
| `LowFareSearchReq` | `POST` | `AirEndpoint` | Either | `http://www.travelport.com/schema/air_v51_0/LowFareSearchReq` |
| `AirPriceReq` | `POST` | `AirEndpoint` | Either | `http://www.travelport.com/schema/air_v51_0/AirPriceReq` |
| `AirTicketingReq` | `POST` | `AirEndpoint` | Either | `http://www.travelport.com/schema/air_v51_0/AirTicketingReq` |
| `AirCreateReservationReq` | `POST` | `UniversalEndpoint` | Either | `http://www.travelport.com/schema/universal_v51_0/AirCreateReservationReq` |
| `UniversalRecordRetrieveReq` | `POST` | `UniversalEndpoint` | Either | `http://www.travelport.com/schema/universal_v51_0/UniversalRecordRetrieveReq` |

For request/response shape and a copy-pasteable Ping example, see Part 1.

---

## 4. Troubleshooting quick reference

| Symptom | Likely cause |
|---|---|
| `401 Unauthorized` from Travelport | Wrong `Username`/`Password`, username missing the `Universal API/` prefix, or sending both Basic auth *and* a WSSE header in the same request |
| HTML page instead of XML/SOAP response | Hit the wrong URL (e.g. a load balancer/WAF error page) — double check the endpoint against `appsettings.json` |
| `500`/fault with "Error 7228" | Missing the `ActionStatus Type="TAW"` workaround on `AirCreateReservationReq` — see `AirBookingController.BuildReservationRequest` |
| Empty/`CHANGE_ME` values from `GET /api/debug/travelport-auth` | Credentials were never filled in `appsettings.Development.json` |
| Response body looks JSON-escaped (`\"`, `\n` everywhere) instead of raw XML | Expected for some `Ok(string)` responses depending on content negotiation — unescape it, the underlying content is still the real Travelport XML |
