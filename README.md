# FlightHub — Flight Search & Booking System

A full-stack internal tool for a small travel agency. Staff can search flights, book seats, view bookings, and cancel them. Built with **FastAPI** (backend) + **Express.js** (frontend) on **SQLite**.

---

## Project Structure

```
savvpro-test-flight/
├── backend/                  # FastAPI backend
│   ├── main.py               # FastAPI app + CORS + router registration
│   ├── models.py             # SQLAlchemy ORM models (Flight, Booking)
│   ├── schemas.py            # Pydantic request/response schemas
│   ├── database.py           # SQLite engine + session factory
│   ├── init_db.py            # Database seeding script
│   ├── routers/
│   │   ├── flights.py        # /api/flights endpoints
│   │   └── bookings.py       # /api/bookings endpoints
│   ├── requirements.txt      # Python dependencies
│   └── flighthub.db          # SQLite database (auto-created)
│
├── Frontend/                 # Express.js frontend
│   ├── server.js             # Express server (serves UI + proxies API)
│   ├── package.json          # Node dependencies
│   └── public/
│       ├── index.html        # Main UI
│       ├── app.js            # Client-side logic
│       └── style.css         # Styling
│
├── ARCHITECTURE.md           # Data model, API contract, design decisions
└── README.md                 # You are here
```

---

## Prerequisites

- **Python 3.8+**
- **Node.js 14+**
- SQLite ships with Python — nothing to install separately

---

## Setup & Run

The app needs **two terminals** — one for the backend, one for the frontend.

### 1. Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1
# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Seed the database (idempotent — skips if data already exists)
python init_db.py

# Start the API server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Backend listens on **http://localhost:8000**
- Interactive API docs (Swagger): **http://localhost:8000/docs**

### 2. Frontend (new terminal)

```bash
cd Frontend

npm install
npm start
```

- Frontend served on **http://localhost:3000**
- Open that URL in a browser to use the app
- The Express server proxies `/api/*` calls to the FastAPI backend, so the browser only ever talks to `localhost:3000`

To override the backend URL the proxy targets, set `API_URL` (default `http://localhost:8000/api`):

```bash
API_URL=http://localhost:8000/api npm start
```

---

## API Endpoints

**Base URL:** `http://localhost:8000/api`

### Flights
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/flights` | List all flights; optional filters: `origin`, `destination`, `departure_date` |
| `GET` | `/flights/search` | Strict search — all three params required |
| `GET` | `/flights/options` | Distinct origins, destinations, and dates (powers UI dropdowns) |
| `GET` | `/flights/{id}` | Single flight by ID |
| `GET` | `/flights/{id}/seats` | Seat availability + list of confirmed booked seats |

### Bookings
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/bookings` | Create a booking — body: `flight_id`, `passenger_name`, `passport_number`, `seat_number` |
| `GET` | `/bookings` | List all bookings |
| `GET` | `/bookings/{booking_reference}` | Single booking by reference (e.g. `BK-ABC123`) |
| `GET` | `/bookings/passenger/{name}` | All bookings for a passenger (case-insensitive partial match) |
| `DELETE` | `/bookings/{booking_reference}` | Cancel a booking; restores the seat |

### Quick API smoke test (cURL)

```bash
# Search for flights
curl "http://localhost:8000/api/flights/search?origin=Islamabad&destination=Lahore&departure_date=2026-05-15"

# Create a booking
curl -X POST http://localhost:8000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"flight_id": 1, "passenger_name": "John Doe", "passport_number": "AB123456", "seat_number": 5}'

# Get a booking (use the reference returned above)
curl http://localhost:8000/api/bookings/BK-ABC123

# Cancel
curl -X DELETE http://localhost:8000/api/bookings/BK-ABC123
```

---

## Sample Data

`python init_db.py` seeds 170 flights spanning 10 days (15–24 May 2026) on these routes:

**Domestic (Pakistan):** Islamabad ↔ Lahore, Lahore ↔ Karachi, Karachi ↔ Islamabad, Islamabad ↔ Peshawar, Lahore ↔ Multan, Karachi ↔ Quetta, Multan → Karachi.

**International:** Karachi ↔ Dubai, Lahore ↔ Doha, Islamabad → Doha, Karachi ↔ Bangkok, Lahore → Dubai, Islamabad → Jeddah.

Prices range from **Rs. 3,200** (domestic short-haul) to **Rs. 24,500** (international long-haul). Seat capacities range from 90 to 220.

### Reset the database

```bash
cd backend
rm flighthub.db        # Windows: del flighthub.db
python init_db.py
```

---

## Assumptions

The task left a few details open. Here's what was decided and why:

1. **No overbooking allowed.** When the last seat is taken, `POST /bookings` returns `409 Conflict` with *"This flight is fully booked. No seats are available."* Safer for a travel agency than allowing waitlists, and unambiguous to test. Implemented as an atomic compare-and-decrement on `flights.available_seats` so concurrent bookings can't both claim the last seat.

2. **Cancellation is a soft delete.** `DELETE /bookings/{ref}` flips `status` from `CONFIRMED` to `CANCELLED` and stamps `cancelled_at` — the booking row is preserved for audit. Seat availability increments back, capped at `total_seats` to guard against double-cancel replays.

3. **Booking references are server-generated** in the format `BK-XXXXXX` (6 alphanumeric chars). The `booking_reference` column has a `UNIQUE` constraint as the safety net.

4. **Cities are stored as full names** (e.g. `Islamabad`, `Lahore`), not IATA codes. Search is case-insensitive (`ILIKE`).

5. **Passenger lookup is a partial match** — `GET /bookings/passenger/John` matches *John Doe*, *Johnny Smith*, etc. Trade-off chosen for staff usability over strict matching.

6. **No authentication.** This is an internal staff tool per the brief. Adding auth would be a fast follow-up — every endpoint already runs through a single dependency-injected DB session.

7. **No payments / no waitlist / no email confirmation.** Bookings are confirmed instantly. Refunds are computed but not actually transferred — the cancellation response includes `refund_amount: <price_per_seat>` for the UI to display.

8. **Date and time stored separately.** `departure_date DATE` + `departure_time TIME` — makes calendar filtering by date trivial without timezone arithmetic. Timestamps (`booked_at`, `cancelled_at`) are stored in UTC; the frontend converts to the viewer's local timezone for display.

9. **Pagination is client-side.** The flight list endpoint returns all matches in one response; the UI reveals 9 cards at a time via a "Load More" button. Fine at the 170-row scale of the sample data; would move to server-side `limit`/`offset` if the dataset grew.

10. **The frontend Express server only serves static assets and proxies the API.** No server-side rendering. The browser fetches `/api/*` and Express forwards to FastAPI — keeps CORS simple and lets the backend stay deployment-agnostic.

See **ARCHITECTURE.md** for the full data model, schema details, and HTTP status code matrix.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | FastAPI | 0.104.1 |
| ORM | SQLAlchemy | 2.0.23 |
| Validation | Pydantic | 2.5.0 |
| Database | SQLite | (built-in) |
| Frontend server | Express.js | 4.18.2 |
| UI | Vanilla HTML/CSS/JS | — |
| Runtime | Node.js | 14+ |

---

## Troubleshooting

**Frontend can't reach backend:**
- Make sure the backend is actually listening on port 8000 (`uvicorn` output should say `Uvicorn running on http://0.0.0.0:8000`)
- If you changed the backend port, set `API_URL` when starting the frontend

**Port already in use:**
- Backend: `netstat -ano | findstr :8000` (Windows) or `lsof -i :8000` (macOS/Linux)
- Frontend: `netstat -ano | findstr :3000` or `lsof -i :3000`

**Database is out of sync (e.g. seat counts don't match bookings):**

This usually happens after raw SQL deletes that bypass the application's seat-reservation logic. Resync with:

```sql
UPDATE flights
SET available_seats = total_seats - (
    SELECT COUNT(*) FROM bookings
    WHERE bookings.flight_id = flights.id AND bookings.status = 'CONFIRMED'
);
```

Or just delete `flighthub.db` and re-run `python init_db.py`.

---

## License

ISC
