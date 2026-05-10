# FlightHub — Architecture

This document covers what was actually built: the **data model**, the **API design**, and the **decisions made for the deliberately-ambiguous parts of the brief**.

For setup/run instructions see [README.md](README.md).

---

## System Overview

```
┌─────────────────┐        HTTP /api/*        ┌──────────────────┐        SQL        ┌──────────┐
│  Browser (UI)   │ ─────────────────────────▶│  Express server   │                   │          │
│  HTML / CSS /   │                            │  (port 3000)      │                   │          │
│  vanilla JS     │ ◀──────────────────────── │  serves UI +      │ ───── REST ────▶  │ FastAPI  │ ──▶ SQLite
│                 │                            │  proxies /api/*   │                   │ (8000)   │
└─────────────────┘                            └──────────────────┘                   └──────────┘
```

- **Browser** only ever talks to `localhost:3000`. This keeps CORS off the critical path and lets the backend stay deployment-agnostic.
- **Express** is a thin static-file server + reverse proxy. No SSR, no templating, no business logic.
- **FastAPI** owns all business logic and is the only thing that touches the database.
- **SQLite** is a single file (`backend/flighthub.db`). No external service required.

---

## Data Model

### Entity Relationship

```
┌─────────────────────────────────┐         ┌──────────────────────────────────┐
│ flights                         │         │ bookings                         │
├─────────────────────────────────┤         ├──────────────────────────────────┤
│ id                  PK          │ 1     N │ id                  PK           │
│ origin              VARCHAR(100)│ ────────│ booking_reference   VARCHAR(10) U│
│ destination         VARCHAR(100)│         │ flight_id           FK → flights │
│ departure_date      DATE        │         │ passenger_name      VARCHAR(255) │
│ departure_time      TIME        │         │ passport_number     VARCHAR(20)  │
│ duration_minutes    INTEGER     │         │ seat_number         INTEGER      │
│ price_per_seat      DECIMAL(10,2)│         │ status              VARCHAR(20)  │
│ total_seats         INTEGER     │         │ booked_at           DATETIME     │
│ available_seats     INTEGER     │         │ cancelled_at        DATETIME?    │
│ created_at          DATETIME    │         └──────────────────────────────────┘
└─────────────────────────────────┘
```

### `flights`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `origin` | VARCHAR(100), indexed | City name (e.g. `"Islamabad"`). See *Decision 4*. |
| `destination` | VARCHAR(100), indexed | City name |
| `departure_date` | DATE, indexed | Date filtering is a primary access pattern, so it gets its own column + index |
| `departure_time` | TIME | Stored separately from date — see *Decision 8* |
| `duration_minutes` | INTEGER | Flight duration |
| `price_per_seat` | DECIMAL(10,2) | Pakistani Rupees (PKR) — sample data ranges Rs. 3,200 – 24,500 |
| `total_seats` | INTEGER | Aircraft capacity, immutable after creation |
| `available_seats` | INTEGER | **Cached counter**, mutated by booking/cancellation logic — see *Concurrency* |
| `created_at` | DATETIME | Audit |

### `bookings`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Internal only; never exposed to clients |
| `booking_reference` | VARCHAR(10), **UNIQUE**, indexed | Public ID, format `BK-XXXXXX` |
| `flight_id` | INTEGER FK | `cascade="all, delete-orphan"` from the relationship |
| `passenger_name` | VARCHAR(255), indexed | Indexed because passenger lookup is a documented access pattern |
| `passport_number` | VARCHAR(20) | Free-form string; **not validated for format** — passport rules vary by country, and the brief explicitly excluded validation |
| `seat_number` | INTEGER | Constrained to `1..flights.total_seats` at the application layer |
| `status` | VARCHAR(20) | Enum-in-string: `CONFIRMED` or `CANCELLED`. Sticking to plain strings keeps the SQLite migration story trivial |
| `booked_at` | DATETIME | UTC, server-stamped |
| `cancelled_at` | DATETIME, nullable | Set only when `status` flips to `CANCELLED` |

### Indexes

Indexes are chosen around the actual access patterns, not added speculatively:

- `flights.origin`, `flights.destination`, `flights.departure_date` — used by the search endpoint's `WHERE` clause
- `bookings.booking_reference` — primary lookup key for `GET` and `DELETE`
- `bookings.flight_id` — used by the seat-map endpoint and cancellation refund lookup
- `bookings.passenger_name` — used by the passenger-name lookup

---

## API Design

**Base URL:** `http://localhost:8000/api`

### Conventions

- All errors use FastAPI's standard shape: `{ "detail": "<message>" }`. Pydantic validation errors (422) return a structured `detail` array with field-level info.
- Request bodies are JSON; query params are used for `GET` filtering.
- City names are matched **case-insensitively** server-side (`ILIKE`), so the client doesn't need to normalize case.
- Timestamps are stored in UTC and returned naive ISO; the frontend tags them with `Z` before parsing so the browser converts to local time for display. (See trade-off note in *Decision 8*.)

### Endpoints

#### `GET /api/flights`
List flights, optionally filtered.

| Query param | Required | Notes |
|---|---|---|
| `origin` | No | Case-insensitive city match |
| `destination` | No | Case-insensitive city match |
| `departure_date` | No | `YYYY-MM-DD` |

**200 OK** — `{ flights: FlightResponse[], count: number }`
**400 Bad Request** — `departure_date` is not a valid date

```json
{
  "flights": [
    {
      "id": 1,
      "origin": "Islamabad",
      "destination": "Lahore",
      "departure_date": "2026-05-15",
      "departure_time": "06:00:00",
      "duration_minutes": 60,
      "price_per_seat": 4500.00,
      "total_seats": 150,
      "available_seats": 148
    }
  ],
  "count": 1
}
```

#### `GET /api/flights/search`
Strict version of the list endpoint — *all three* params required.

**200 OK** — `{ results: FlightResponse[], count: number }`
**400 Bad Request** — Missing or malformed params
**404 Not Found** — No flights match the criteria (chosen over an empty `200` so the UI can show a clear "no results" branch from the HTTP status alone)

#### `GET /api/flights/options`
Distinct origin cities, destination cities, and departure dates currently in the table. Powers the UI's filter dropdowns and the calendar's `min`/`max`.

**200 OK** — `{ origins: string[], destinations: string[], dates: string[] }`

#### `GET /api/flights/{id}`
Single flight by ID.

**200 OK** — `FlightResponse`
**404 Not Found** — `Flight with ID {id} not found`

#### `GET /api/flights/{id}/seats`
Returns seat availability and the list of currently-confirmed seats. Used by the booking modal's seat-map.

**200 OK** — `{ flight_id, total_seats, available_seats, booked_seats: number[] }`
**404 Not Found** — Flight doesn't exist

#### `POST /api/bookings`
Create a booking.

**Request body:**
```json
{
  "flight_id": 1,
  "passenger_name": "John Doe",
  "passport_number": "AB123456",
  "seat_number": 5
}
```

**201 Created** — full booking record including the generated `booking_reference`
**404 Not Found** — `flight_id` doesn't exist
**400 Bad Request** — `seat_number` outside `1..total_seats`
**409 Conflict** — That specific seat is already booked, **or** the flight has no seats left (atomic check — see *Concurrency*)
**422 Unprocessable Entity** — Pydantic validation (missing field, wrong type, name too long, etc.)

#### `GET /api/bookings`
List **all** bookings.

**200 OK** — `{ bookings: BookingDetailResponse[], count }`
**404 Not Found** — No bookings exist yet

#### `GET /api/bookings/{booking_reference}`
Single booking with embedded flight details.

**200 OK** — `BookingDetailResponse`
**404 Not Found** — Reference doesn't exist

#### `GET /api/bookings/passenger/{passenger_name}`
All bookings for a passenger. Match is **case-insensitive partial** (`ILIKE %name%`) — see *Decision 5*.

**200 OK** — `{ passenger_name, bookings: BookingDetailResponse[] }`
**404 Not Found** — No bookings match

#### `DELETE /api/bookings/{booking_reference}`
Soft-cancel a booking. Sets `status = 'CANCELLED'`, stamps `cancelled_at`, and increments the flight's `available_seats` (capped at `total_seats`).

**200 OK** — `{ message, booking_reference, refund_amount }`
**400 Bad Request** — Already cancelled
**404 Not Found** — Reference doesn't exist

### HTTP Status Code Matrix

| Code | When |
|------|------|
| `200 OK` | Successful retrieval / cancellation |
| `201 Created` | Successful booking |
| `400 Bad Request` | Invalid date format, seat out of range, double-cancel |
| `404 Not Found` | Flight / booking / passenger / search-with-no-results |
| `409 Conflict` | Seat already booked, or flight fully booked |
| `422 Unprocessable Entity` | Pydantic body validation failures |

---

## Concurrency — Preventing Double-Booking

`flights.available_seats` is a **cached counter** rather than a live `COUNT(*)` of bookings. That keeps reads cheap, but writes need to be race-safe. Two requests booking the last seat must not both succeed.

The booking endpoint uses **atomic compare-and-decrement**:

```python
rows_updated = db.query(Flight).filter(
    Flight.id == flight_id,
    Flight.available_seats > 0       # condition evaluated inside the UPDATE
).update(
    {"available_seats": Flight.available_seats - 1}
)
if rows_updated == 0:
    raise HTTPException(409, "This flight is fully booked. ...")
```

The condition `available_seats > 0` is evaluated **inside the UPDATE statement**, not in Python. SQLite serializes writes, so even with two concurrent requests, exactly one of them sees `available_seats > 0` and decrements; the other gets `rows_updated == 0` and is rejected with `409`.

A specific-seat collision (two requests trying to book the same seat number on a flight that still has *other* seats) is caught by a fast-path check before the decrement, plus the database's UNIQUE constraint on `(flight_id, seat_number)` would catch any collision the application missed. (Currently enforced at the application layer only — see *Trade-offs* below.)

Cancellation uses a **capped atomic increment**:

```sql
UPDATE flights
SET available_seats = MIN(available_seats + 1, total_seats)
WHERE id = :flight_id
```

`MIN(... , total_seats)` makes double-cancel idempotent at the seat-counter level — even if a cancellation somehow runs twice, the seat count never exceeds capacity.

### Pool configuration

`backend/database.py` uses `NullPool` for SQLite — every request opens a fresh connection and closes it on return. This avoids the "database is locked" failure mode where a long-lived connection holds a write lock while another request tries to commit.

---

## Ambiguity Resolutions

The brief deliberately left some details open. Here's what was chosen and why.

### 1. "Handle overbooking appropriately"

**Decision:** Strict no-overbooking. The last seat goes to whoever's request the database commits first; everyone else gets `409 Conflict` with a clear message.

**Why:**
- A travel agency selling a seat that doesn't exist is a worse failure mode than a customer seeing "fully booked" and trying another flight
- It's easier to reason about and test
- A waitlist could be added later without changing this contract — it would be an additional state, not a replacement for the strict rule

**Why `409` not `400`:** The request itself is well-formed; the conflict is with the *current state of the resource*. RFC 7231 says `409` for that exact case. `400` is for malformed input.

### 2. "Display relevant flight information"

**Decision:** The flight card surfaces what staff actually need to make a quick recommendation:

- **Origin → Destination** (largest, brand color — first thing the eye lands on)
- **Departure date and time** — answers "when does it leave?"
- **Duration** — answers "how long is the flight?"
- **Price** — decision driver
- **Seats left / total** — second decision driver, color-coded (green if seats available, red if zero)
- **Book Now** button is the only action; if seats are zero, it becomes a disabled "No Seats Available" button rather than disappearing, so staff can see the flight existed and was just full

**Why this layout:** Staff are answering customer phone questions in real time. The information hierarchy mirrors the question hierarchy: *where → when → how long → how much → can I book?*

### 3. Cancellation = soft delete

**Decision:** `DELETE /bookings/{ref}` flips `status` to `CANCELLED` and stamps `cancelled_at`; the row stays.

**Why:** Cancellation is an audit-relevant event. A staff member who cancels a booking by mistake should be able to look it up by reference and see what happened. Hard-deleting would erase that history.

The downside (storage growth) is irrelevant at this scale.

### 4. City names instead of IATA codes

**Decision:** `flights.origin` and `flights.destination` store full city names (`"Islamabad"`, `"Lahore"`) rather than IATA airport codes (`"ISB"`, `"LHR"`).

**Why:** The UI is the primary consumer, and showing a city name is what staff and customers want to see. Storing codes would require a lookup table just to render them. Keeping it human-readable in the table simplifies the entire stack.

**Trade-off:** Slightly more storage, no canonical-form benefits. Worth it for the UI simplicity.

### 5. Passenger lookup is partial / case-insensitive

`GET /bookings/passenger/Jo` matches *John Doe*, *Jonas Smith*, *Anjo Cruz*. Used `ILIKE %name%`.

**Why:** Staff don't always know the exact spelling and definitely don't know the case. Strict equality would force them to ask the customer to spell their name — bad UX for an internal tool. Risk of false positives is acceptable because the result set always shows the full booking and passenger name for confirmation.

### 6. No authentication

**Decision:** Every endpoint is open.

**Why:** The brief says "internal tool for staff" with no auth requirement. Adding auth here would be design-by-speculation. The codebase is structured so it can be added later in one place — every route uses the same `Depends(get_db)` injection point.

### 7. Refunds are reported, not transferred

The cancellation response includes `refund_amount` so the UI can show *"Refund: Rs. 4,500"*, but no payment system actually moves money. The brief explicitly excluded payment integration.

### 8. Date and time stored separately; UTC for events

**Decision:**
- `departure_date DATE` + `departure_time TIME` — calendar filtering by date is a primary use case, and a `DATE` column makes that filter trivial without timezone arithmetic
- `booked_at DATETIME` and `cancelled_at DATETIME` — stored in UTC
- The frontend tags returned timestamps with `Z` before parsing (`new Date(ts + 'Z')`) so the browser converts to the viewer's local time

**Trade-off:** The "proper" fix would be `DateTime(timezone=True)` columns + `datetime.now(timezone.utc)` everywhere. The current frontend-side fix is simpler and works for the local-dev use case the brief describes; promoting it to TZ-aware columns is a one-commit change if the app moves to a real deployment.

### 9. Pagination is client-side

`GET /api/flights` returns the whole match set. The UI shows 9 cards at a time and reveals more on a "Load More" click.

**Why:** At the seed-data scale (170 rows total, typical search returns 10–20), a server-side `limit`/`offset` would add complexity without measurable benefit. The component is structured so swapping in server-side paging is a localized change in one fetch site.

### 10. Frontend is a static SPA, Express is a proxy only

**Decision:** No SSR, no templating, no business logic in the Express layer.

**Why:** It's the smallest deployable surface that satisfies the brief's "Node.js / Express" requirement. The browser ↔ FastAPI contract is the only API contract that matters; Express is just hiding the cross-origin from the browser.

---

## Trade-offs Considered

These are decisions that are *currently* one way but could reasonably go the other:

- **`(flight_id, seat_number)` UNIQUE constraint at the DB level** — would catch any application-layer bug that lets two `CONFIRMED` bookings share a seat. Currently enforced only by the fast-path check + the atomic decrement. Worth adding if the app gains write paths beyond the current single endpoint.
- **`status` as a string vs an enum** — strings are simpler to migrate; enums are stricter. Chose strings; trivial to swap.
- **Booking reference collisions** — `BK-` + 6 alphanumeric chars = 36⁶ ≈ 2.2B possibilities. With the UNIQUE constraint, a collision causes `IntegrityError` on commit. Currently handled by the generic `except` in `POST /bookings`, which surfaces a `409`. A retry-on-collision loop would be cleaner; the current odds (≈ 1 in millions per booking at any realistic agency volume) didn't justify it.
- **Search with no results returning 404 vs 200 with empty array** — picked 404 because the UI cares about the distinction and HTTP gives it for free. Some style guides prefer 200 with empty array; both are defensible.

---

## Tech Stack Summary

| Layer | Choice | Why |
|---|---|---|
| API framework | FastAPI 0.104 | Async-ready, Pydantic-native validation, free Swagger UI |
| ORM | SQLAlchemy 2.0 | Declarative + Core escape hatch (used in cancellation for `MIN(...)`) |
| Validation | Pydantic 2.5 | Field-level error messages out of the box → satisfies the validation requirement |
| DB | SQLite | Brief allows it; zero-ops; supports the concurrency primitives we need |
| Frontend host | Express 4 | Brief requires it; proxy + static is the smallest correct implementation |
| UI | Vanilla HTML/CSS/JS | No build step; nothing to learn before reading the code |
