# FlightHub — User Guide

How to use FlightHub through the web UI and through the REST API.

For setup instructions see [README.md](README.md). For data model and design rationale see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Web UI

Open **http://localhost:3000** once both servers are running. You'll see the splash screen briefly, then the main app with two tabs: **Search Flights** and **My Bookings**.

### 1. Searching for flights

The **Search Flights** tab is the default landing view.

**To see everything available**, just click **Show All Flights**. The first 9 results render as cards, with a **Load More** button below the grid showing how many results remain.

**To filter:**

- **From (Origin)** — click the field, the full list of available origin cities drops down. Type any letter to filter the list (e.g. typing `is` narrows to *Islamabad*). Use ↑/↓ to navigate, Enter to pick, Esc to close. The × button clears the field.
- **To (Destination)** — same widget, same city list.
- **Departure Date** — native calendar picker, constrained to the date range of available flights (15–24 May 2026 in the seed data).

Leave any field empty to mean "any". Click **Show All Flights** to apply.

Each flight card shows:

| Field | Example |
|---|---|
| Origin → Destination | `Islamabad → Lahore` (heading, brand color) |
| Departure date | `2026-05-15` |
| Departure time | `06:00 AM` |
| Duration | `1h 0m` |
| Price | `Rs. 4,500` |
| Available seats | `148/150` (green if seats available, red if zero) |

If the flight is full, the **Book Now** button is replaced by a disabled **No Seats Available** label.

### 2. Booking a flight

Click **Book Now** on any flight card. A modal opens with:

1. **Flight summary** at the top — route, date/time, price, current availability.
2. **Passenger Full Name** — required text field.
3. **Passport Number** — required text field, no format enforcement (passport rules vary by country).
4. **Visual seat map** — a grid showing every seat on the aircraft:
   - **Green** = available (clickable)
   - **Red** = already booked (not clickable, slightly faded)
   - **Purple** = your current selection
   The selected seat number is shown beneath the map.
5. **Confirm Booking** button — disabled-feeling state until you fill all fields and pick a seat.

On success, the modal switches to a green confirmation panel with your **booking reference** (format `BK-XXXXXX`). Save this reference — it's how you'll find or cancel the booking later. The flight card's seat count updates in the background.

If something fails (someone else took the seat in the meantime, validation error, etc.), a clear error message appears at the bottom of the modal and the seat map refreshes so you can pick a different seat.

### 3. Viewing your bookings

Click **My Bookings** in the top nav. The tab loads **all bookings** in the system on entry, displayed as compact cards with reference, route, departure, passenger, seat, and status (CONFIRMED / CANCELLED).

**To find a specific booking:**

- Type a **booking reference** (e.g. `BK-OFSNMT`) and click **Search Bookings** — exact-match lookup.
- Or type a **passenger name** (e.g. `John`) — case-insensitive partial match, so `John` finds *John Doe*, *Johnson Smith*, etc.

**To see full details of a booking**, click **Review Details** on the card. A detail modal opens showing:

- Booking reference and status badge
- Flight route, departure datetime, duration
- Passenger name and passport number
- Seat number, price per seat
- Booked-on timestamp (in your local timezone)
- Cancelled-on timestamp (only if cancelled)

### 4. Cancelling a booking

From either the booking card or the detail modal, click the red **Cancel Booking** button. A confirmation dialog appears (matching the app's UI, not the browser default):

> **Cancel Booking?**
> Are you sure you want to cancel this booking? This action cannot be undone.
>
> **[ Keep Booking ]   [ Yes, Cancel Booking ]**

On confirmation, a green toast slides in from the top-right confirming the cancellation and showing the refund amount (e.g. *"Booking cancelled. Refund: Rs. 4,500"*). The bookings list refreshes — the cancelled booking now shows status **CANCELLED** with no Cancel button. Its seat returns to the flight's availability pool.

You can dismiss the confirmation dialog by clicking outside it, pressing **Esc**, or clicking **Keep Booking**.

---

## API / cURL Recipes

Base URL: `http://localhost:8000/api`

The API is also explorable interactively at **http://localhost:8000/docs** (Swagger UI from FastAPI).

### List all flights

```bash
curl http://localhost:8000/api/flights
```

Response:

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
    },
    ...
  ],
  "count": 170
}
```

### Filter flights (any combination is optional)

```bash
# By origin
curl "http://localhost:8000/api/flights?origin=Islamabad"

# By origin + destination
curl "http://localhost:8000/api/flights?origin=Karachi&destination=Dubai"

# By date only
curl "http://localhost:8000/api/flights?departure_date=2026-05-15"

# All three
curl "http://localhost:8000/api/flights?origin=Lahore&destination=Doha&departure_date=2026-05-16"
```

City matching is **case-insensitive**, so `origin=islamabad` and `origin=ISLAMABAD` both work.

### Strict search (all three params required)

Use this when you want a 404 instead of an empty list when nothing matches:

```bash
curl "http://localhost:8000/api/flights/search?origin=Islamabad&destination=Lahore&departure_date=2026-05-15"
```

If nothing matches:

```bash
curl "http://localhost:8000/api/flights/search?origin=Islamabad&destination=Tokyo&departure_date=2026-05-15"
# → 404
# {"detail": "No flights found from Islamabad to Tokyo on 2026-05-15"}
```

### Get filter options (cities + dates currently in the data)

```bash
curl http://localhost:8000/api/flights/options
```

```json
{
  "origins": ["Bangkok", "Doha", "Dubai", "Islamabad", "Karachi", "Lahore", "Multan", "Peshawar"],
  "destinations": ["Bangkok", "Doha", "Dubai", "Islamabad", "Jeddah", "Karachi", "Lahore", "Multan", "Peshawar", "Quetta"],
  "dates": ["2026-05-15", "2026-05-16", "2026-05-17", ...]
}
```

### Get a single flight by ID

```bash
curl http://localhost:8000/api/flights/1
```

### Check seat availability for a flight

```bash
curl http://localhost:8000/api/flights/1/seats
```

```json
{
  "flight_id": 1,
  "total_seats": 150,
  "available_seats": 148,
  "booked_seats": [5, 25]
}
```

### Create a booking

```bash
curl -X POST http://localhost:8000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "flight_id": 1,
    "passenger_name": "Fatima Khan",
    "passport_number": "AB123456",
    "seat_number": 12
  }'
```

**Success response (201 Created):**

```json
{
  "id": 6,
  "booking_reference": "BK-XYZ789",
  "flight_id": 1,
  "passenger_name": "Fatima Khan",
  "passport_number": "AB123456",
  "seat_number": 12,
  "status": "CONFIRMED",
  "booked_at": "2026-05-10T15:16:17.123456",
  "cancelled_at": null
}
```

Save the `booking_reference` — that's the ID for any future operation on this booking.

### Look up a booking by reference

```bash
curl http://localhost:8000/api/bookings/BK-XYZ789
```

Returns the booking with the flight details embedded:

```json
{
  "booking_reference": "BK-XYZ789",
  "flight": {
    "id": 1,
    "origin": "Islamabad",
    "destination": "Lahore",
    "departure_date": "2026-05-15",
    "departure_time": "06:00:00",
    "duration_minutes": 60,
    "price_per_seat": 4500.00,
    "total_seats": 150,
    "available_seats": 147
  },
  "passenger_name": "Fatima Khan",
  "passport_number": "AB123456",
  "seat_number": 12,
  "status": "CONFIRMED",
  "booked_at": "2026-05-10T15:16:17.123456",
  "cancelled_at": null
}
```

### Look up bookings by passenger name (partial match)

```bash
curl "http://localhost:8000/api/bookings/passenger/Fatima"
```

Matches any passenger whose name contains "Fatima" (case-insensitive).

### List all bookings

```bash
curl http://localhost:8000/api/bookings
```

### Cancel a booking

```bash
curl -X DELETE http://localhost:8000/api/bookings/BK-XYZ789
```

```json
{
  "message": "Booking cancelled successfully",
  "booking_reference": "BK-XYZ789",
  "refund_amount": 4500.00
}
```

After cancellation:
- The booking's `status` becomes `"CANCELLED"`
- `cancelled_at` is stamped with the current time
- The flight's `available_seats` increments back by 1
- The booking row is **not deleted** — it's preserved for audit; you can still `GET` it

---

## Common Error Responses

| Status | When | Example response |
|---|---|---|
| `400` | Bad date format on a list request | `{"detail": "Invalid departure_date format. Use YYYY-MM-DD"}` |
| `400` | Seat number outside `1..total_seats` | `{"detail": "Seat number must be between 1 and 150"}` |
| `400` | Trying to cancel an already-cancelled booking | `{"detail": "This booking is already cancelled"}` |
| `404` | Flight ID doesn't exist | `{"detail": "Flight with ID 999 not found"}` |
| `404` | Booking reference doesn't exist | `{"detail": "Booking with reference BK-FAKE not found"}` |
| `404` | Passenger name lookup with no matches | `{"detail": "No bookings found for passenger 'Alice'"}` |
| `404` | Strict search returns no flights | `{"detail": "No flights found from X to Y on Z"}` |
| `409` | Seat is already taken on that flight | `{"detail": "Seat 12 is already booked. Please choose a different seat."}` |
| `409` | Flight is fully booked (last seat just claimed) | `{"detail": "This flight is fully booked. No seats are available."}` |
| `422` | Pydantic body validation (missing field, wrong type) | `{"detail": [{"loc": ["body", "passenger_name"], "msg": "Field required", "type": "missing"}]}` |

---

## End-to-end booking walkthrough (cURL)

Replace `BK-XYZ789` with whatever `booking_reference` is returned in step 2.

```bash
# 1. Find a flight
curl "http://localhost:8000/api/flights/search?origin=Islamabad&destination=Lahore&departure_date=2026-05-15"

# 2. Check which seats are taken
curl http://localhost:8000/api/flights/1/seats

# 3. Book a seat that wasn't in `booked_seats`
curl -X POST http://localhost:8000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"flight_id": 1, "passenger_name": "Fatima Khan", "passport_number": "AB123456", "seat_number": 30}'

# 4. Verify the booking exists
curl http://localhost:8000/api/bookings/BK-XYZ789

# 5. Cancel it
curl -X DELETE http://localhost:8000/api/bookings/BK-XYZ789

# 6. Verify the seat is freed
curl http://localhost:8000/api/flights/1/seats
# `available_seats` is back to its pre-booking value; 30 is no longer in `booked_seats`
```

---

## Tips

- **Booking references are case-insensitive on lookup** — `bk-xyz789` and `BK-XYZ789` both resolve to the same booking.
- **The seat-availability endpoint is the source of truth** for which seats are free. The cached counter on `/flights/{id}` can briefly differ if you bypass the API (raw SQL deletes won't update it). See *Troubleshooting* in [README.md](README.md) for the resync SQL.
- **All timestamps from the API are UTC.** The web UI converts them to your local timezone for display; if you're consuming the API directly, treat the strings as UTC even though they don't carry a `Z` suffix.
- **Need to start fresh?** Stop the backend, delete `backend/flighthub.db`, and re-run `python init_db.py`. All flights and bookings are reset to seed state.
