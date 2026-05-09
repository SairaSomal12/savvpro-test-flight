# ✈️ FlightHub - Flight Search & Booking System

A full-stack flight search and booking application built with **FastAPI** (backend) and **Express.js** (frontend).

## 📋 Project Structure

```
savvpro-test-flight/
├── backend/              # FastAPI backend
│   ├── models.py         # SQLAlchemy ORM models
│   ├── schemas.py        # Pydantic validation schemas
│   ├── database.py       # Database configuration
│   ├── init_db.py        # Database seeding script
│   ├── main.py           # FastAPI application
│   ├── routers/
│   │   ├── flights.py    # Flight endpoints
│   │   └── bookings.py   # Booking endpoints
│   ├── requirements.txt  # Python dependencies
│   └── flighthub.db      # SQLite database (auto-created)
│
├── frontend/             # Express.js frontend
│   ├── server.js         # Express server
│   ├── package.json      # Node.js dependencies
│   └── public/
│       ├── index.html    # Main UI
│       ├── app.js        # Client-side JavaScript
│       └── style.css     # Styling
│
├── ARCHITECTURE.md       # Design decisions and API documentation
├── README.md             # This file
└── .gitignore            # Git ignore rules
```

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.8+**
- **Node.js 14+**
- **SQLite3** (bundled with Python)

### Step 1: Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1  # Windows
# OR
source venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Initialize database with sample data
python init_db.py

# Start backend server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Backend runs on:** `http://localhost:8000`
**API Docs:** `http://localhost:8000/docs`

### Step 2: Frontend Setup (in a new terminal)

```bash
cd frontend

# Install dependencies
npm install

# Start frontend server
npm start
```

**Frontend runs on:** `http://localhost:3000`

---

## ✨ Features

### 🔍 Flight Search
- Search flights by origin, destination, and departure date
- View all available flights with filtering options
- Display: origin, destination, date, time, duration, price, seats

### ✈️ Flight Booking
- Select any available flight
- Book seats with passenger details (name, passport)
- Auto-generated unique booking reference (e.g., BK-ABC123)
- Real-time seat availability

### 📖 View Bookings
- Search by booking reference or passenger name
- View complete booking and flight details
- Status tracking (CONFIRMED / CANCELLED)

### ❌ Cancel Bookings
- Cancel any confirmed booking
- Automatic refund calculation
- Seat restoration

---

## 📡 API Endpoints

**Base URL:** `http://localhost:8000/api`

### Flights
```
GET /flights                                    # List all flights
GET /flights/search?origin=ISB&destination=LHE&departure_date=2026-05-15
GET /flights/{id}                               # Get flight by ID
```

### Bookings
```
POST /bookings                                  # Create booking
GET /bookings/{booking_reference}               # Get booking
GET /bookings/passenger/{passenger_name}        # Get bookings by passenger
DELETE /bookings/{booking_reference}            # Cancel booking
```

---

## 🌍 Sample Data

**180+ flights** across 2 weeks (May 15-24, 2026)

### Domestic Routes (Pakistan)
- ISB ↔ LHE (Islamabad ↔ Lahore)
- LHE ↔ KHI (Lahore ↔ Karachi)  
- KHI ↔ ISB (Karachi ↔ Islamabad)
- ISB ↔ PEW (Islamabad ↔ Peshawar)
- MUL ↔ KHI (Multan ↔ Karachi)

### International Routes
- KHI → DXB (Dubai)
- LHE → DOH (Doha)
- ISB → JED (Jeddah)
- KHI → BKK (Bangkok)
- Plus return flights

**Pricing:** Rs. 3,200 - 24,500

---

## 🧪 Testing

### Web UI
1. Visit `http://localhost:3000`
2. Search flights
3. Click "Book Now"
4. Enter details and confirm
5. View bookings in the "My Bookings" tab

### cURL Examples

**Search flights:**
```bash
curl "http://localhost:8000/api/flights/search?origin=ISB&destination=LHE&departure_date=2026-05-15"
```

**Create booking:**
```bash
curl -X POST http://localhost:8000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"flight_id": 1, "passenger_name": "John Doe", "passport_number": "AB123456", "seat_number": 5}'
```

**Get booking:**
```bash
curl http://localhost:8000/api/bookings/BK-ABC123
```

**Cancel booking:**
```bash
curl -X DELETE http://localhost:8000/api/bookings/BK-ABC123
```

---

## 🗄️ Database

### Reset Database
```bash
cd backend
rm flighthub.db           # Delete old database
python init_db.py         # Reinitialize with fresh data
```

---

## 🔒 Design Decisions

### Overbooking Prevention
- **No overbooking allowed**
- Returns `400 Bad Request` when no seats available
- Returns `409 Conflict` if seat already booked

### Architecture Highlights
- Separate `departure_date` and `departure_time` columns
- Transaction-based seat reservation
- Unique booking references (BK-XXXXXX format)
- Automatic refund on cancellation

See **ARCHITECTURE.md** for detailed design documentation.

---

## 📚 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | FastAPI | 0.104.1 |
| ORM | SQLAlchemy | 2.0.23 |
| Database | SQLite | (built-in) |
| Frontend | Express.js | 4.18.2 |
| Runtime | Node.js | 14+ |

---

## ⚠️ Troubleshooting

**Backend connection refused:**
- Ensure backend is running on `http://localhost:8000`
- Check CORS is enabled (default: yes)

**Port already in use:**
- Backend: `lsof -i :8000` or `netstat -ano | findstr :8000`
- Frontend: `lsof -i :3000` or `netstat -ano | findstr :3000`

**Database errors:**
- Delete `flighthub.db` and run `python init_db.py`

---

## 📖 Documentation

- **ARCHITECTURE.md** - Data model, API design, ambiguity resolutions
- **USER_GUIDE.md** - How to use the application with screenshots
- **AI_USAGE.md** - AI tool usage and corrections

---

## 📝 Notes

- **No Authentication:** Internal staff tool
- **No Payments:** Bookings confirmed instantly
- **IATA Codes:** ISB, LHE, KHI, DXB, DOH, BKK, JED, PEW, MUL, QTA

---

## 📄 License

ISC
