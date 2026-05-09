# FlightHub Architecture

## System Overview

FlightHub is a full-stack flight search and booking system consisting of:
- **Backend**: FastAPI REST API with SQLite database
- **Frontend**: Express.js web application with HTML/CSS/JavaScript UI
- **Database**: SQLite (single-file, no external dependencies)

---

## Data Model

### Entity Relationship Diagram

```
FLIGHTS
├── id (primary key)
├── origin
├── destination
├── departure_datetime
├── duration_minutes
├── price_per_seat
├── total_seats
├── available_seats
└── created_at

BOOKINGS
├── id (primary key)
├── booking_reference (unique, generated)
├── flight_id (foreign key → FLIGHTS)
├── passenger_name
├── passport_number
├── seat_number
├── status (CONFIRMED, CANCELLED)
├── booked_at
└── cancelled_at (nullable)
```

### Schema Details

#### Flights Table
| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Unique flight identifier |
| `origin` | VARCHAR(3) | Airport code (e.g., JFK, LAX) |
| `destination` | VARCHAR(3) | Airport code |
| `departure_datetime` | DATETIME | Departure timestamp (UTC) |
| `duration_minutes` | INTEGER | Flight duration |
| `price_per_seat` | DECIMAL(10,2) | Seat price in USD |
| `total_seats` | INTEGER | Total capacity (immutable) |
| `available_seats` | INTEGER | Remaining seats (decrements on booking, increments on cancellation) |
| `created_at` | DATETIME | Flight creation timestamp |

#### Bookings Table
| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Internal booking ID |
| `booking_reference` | VARCHAR(10) UNIQUE | Human-readable reference (e.g., BK-ABC123) |
| `flight_id` | INTEGER FK | Reference to flight |
| `passenger_name` | VARCHAR(255) | Full name |
| `passport_number` | VARCHAR(20) | Passport number (not validated for format) |
| `seat_number` | INTEGER | Assigned seat (1 to total_seats) |
| `status` | VARCHAR(20) | CONFIRMED or CANCELLED |
| `booked_at` | DATETIME | Booking timestamp |
| `cancelled_at` | DATETIME | Cancellation timestamp (nullable) |

---

## API Design

### Base URL
```
http://localhost:8000/api
```

### Authentication & Authorization
None (internal tool for staff, no auth required per requirements)

### Endpoints

#### 1. Get All Flights
```
GET /flights
```
**Query Parameters:**
- `origin` (optional): Filter by origin code
- `destination` (optional): Filter by destination code
- `departure_date` (optional): Filter by date (YYYY-MM-DD format)

**Response (200 OK):**
```json
{
  "flights": [
    {
      "id": 1,
      "origin": "JFK",
      "destination": "LAX",
      "departure_datetime": "2026-05-15T14:30:00Z",
      "duration_minutes": 300,
      "price_per_seat": 299.99,
      "total_seats": 150,
      "available_seats": 45
    }
  ]
}
```

**Response (400 Bad Request):** Invalid filter parameters

---

#### 2. Search Flights
```
GET /flights/search
```
**Query Parameters:**
- `origin` (required): Origin airport code
- `destination` (required): Destination airport code
- `departure_date` (required): YYYY-MM-DD format

**Response (200 OK):**
```json
{
  "results": [
    {
      "id": 1,
      "origin": "JFK",
      "destination": "LAX",
      "departure_datetime": "2026-05-15T14:30:00Z",
      "duration_minutes": 300,
      "price_per_seat": 299.99,
      "available_seats": 45
    }
  ],
  "count": 1
}
```

**Response (400 Bad Request):** Missing or invalid parameters
**Response (404 Not Found):** No matching flights

---

#### 3. Create a Booking
```
POST /bookings
```
**Request Body:**
```json
{
  "flight_id": 1,
  "passenger_name": "John Doe",
  "passport_number": "AB123456",
  "seat_number": 12
}
```

**Response (201 Created):**
```json
{
  "booking_reference": "BK-ABC123",
  "flight_id": 1,
  "passenger_name": "John Doe",
  "passport_number": "AB123456",
  "seat_number": 12,
  "status": "CONFIRMED",
  "booked_at": "2026-05-10T10:30:00Z"
}
```

**Response (400 Bad Request):** 
- Invalid flight_id
- Seat number out of range (1 to total_seats)
- Seat already booked
- Flight has no available seats (see Overbooking Resolution below)
- Missing required fields

**Response (409 Conflict):** Seat already taken (race condition handled via transaction)

---

#### 4. Get Booking by Reference
```
GET /bookings/{booking_reference}
```

**Response (200 OK):**
```json
{
  "booking_reference": "BK-ABC123",
  "flight": {
    "id": 1,
    "origin": "JFK",
    "destination": "LAX",
    "departure_datetime": "2026-05-15T14:30:00Z",
    "price_per_seat": 299.99
  },
  "passenger_name": "John Doe",
  "seat_number": 12,
  "status": "CONFIRMED",
  "booked_at": "2026-05-10T10:30:00Z"
}
```

**Response (404 Not Found):** Booking reference not found

---

#### 5. Get Bookings by Passenger Name
```
GET /bookings/passenger/{passenger_name}
```

**Response (200 OK):**
```json
{
  "passenger_name": "John Doe",
  "bookings": [
    {
      "booking_reference": "BK-ABC123",
      "flight_id": 1,
      "origin": "JFK",
      "destination": "LAX",
      "departure_datetime": "2026-05-15T14:30:00Z",
      "seat_number": 12,
      "status": "CONFIRMED"
    }
  ]
}
```

**Response (404 Not Found):** No bookings found for this passenger

---

#### 6. Cancel a Booking
```
DELETE /bookings/{booking_reference}
```

**Response (200 OK):**
```json
{
  "message": "Booking cancelled successfully",
  "booking_reference": "BK-ABC123",
  "refund_amount": 299.99
}
```

**Response (404 Not Found):** Booking reference not found
**Response (400 Bad Request):** Booking already cancelled

---

## Ambiguity Resolutions

### 1. Overbooking Handling

**Decision:** Strict seat reservation — no overbooking allowed.

**Reasoning:**
- The task says "Handle overbooking appropriately" but doesn't require allowing overbooking
- A strict approach is safer for a travel agency (avoids legal/customer issues)
- Easier to implement and test correctly
- Can extend to waitlists in future iterations

**Implementation:**
- When booking, check that `available_seats > 0`
- Return `400 Bad Request` with message: `"No seats available on this flight"`
- Use database transactions to prevent race conditions (optimistic/pessimistic locking on the flights table)
- Each booking decrements `available_seats` atomically

**Example Scenario:**
```
Flight XY-001 has 1 seat available.
Request A: Book seat 45 → SUCCESS (seat available, now 0 available)
Request B: Book seat 46 → FAIL (no seats available)
```

---

### 2. UI Layout and Information Prioritization

**Decision:** Prioritize quick booking workflow with clear flight details.

**Reasoning:**
- Users (travel agency staff) need to quickly search and book flights
- Price and availability are decision drivers
- Departure time and duration are essential for customer queries

**Frontend Layout:**

1. **Home/Search Page**
   - Search form (Origin, Destination, Date)
   - Live flight results table showing:
     - Origin → Destination
     - Departure time
     - Duration
     - Available seats
     - Price per seat
     - "Book Now" button

2. **Booking Flow**
   - Select seat from visual seat map (1-total_seats)
   - Enter passenger name
   - Enter passport number
   - Confirm booking
   - Display booking reference (highlighted for easy copy)

3. **View Bookings Page**
   - Search by passenger name or booking reference
   - Show booking status, seat, flight details
   - Cancel button (only for CONFIRMED bookings)

---

## Technology Stack

### Backend
- **Framework**: FastAPI 0.104+
- **Database**: SQLite with SQLAlchemy ORM
- **Validation**: Pydantic models
- **CORS**: Enabled for frontend integration

### Frontend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Templating**: EJS or plain HTML
- **HTTP Client**: Fetch API (browser native)
- **Styling**: CSS (minimal framework or custom)

### Testing
- **Backend**: pytest with SQLAlchemy test fixtures
- **Tests to Include**:
  1. Booking prevents overbooking (business rule)
  2. Cancelled booking frees up a seat
  3. Invalid seat number is rejected

---

## Database Initialization

The application will:
1. Auto-create tables on startup if they don't exist (SQLAlchemy `create_all`)
2. Seed sample flights for testing (in a setup script or migration)

**Sample Flight Data:**
```
Flight 1: JFK → LAX, 2026-05-15 14:30 UTC, 300 min, $299.99, 150 seats
Flight 2: LAX → ORD, 2026-05-15 16:00 UTC, 240 min, $199.99, 100 seats
Flight 3: JFK → LAX, 2026-05-16 09:00 UTC, 300 min, $249.99, 150 seats
```

---

## Error Handling

All API responses follow this structure for errors:

```json
{
  "error": true,
  "status_code": 400,
  "message": "Descriptive error message",
  "details": {} // Optional additional context
}
```

**HTTP Status Codes Used:**
- `200 OK` – Successful retrieval
- `201 Created` – Successful booking creation
- `400 Bad Request` – Validation error, no seats available, invalid input
- `404 Not Found` – Flight, booking, or passenger not found
- `409 Conflict` – Seat already booked (race condition)
- `500 Internal Server Error` – Unexpected server error

---

## Deployment & Running

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

Both services run locally. Frontend connects to backend via `http://localhost:8000/api`.

---

## Future Enhancements

- Seat mapping visualization (grid layout)
- Waitlist functionality
- Payment integration
- User authentication for staff
- Email confirmations
- Booking modifications (change seat, date)
