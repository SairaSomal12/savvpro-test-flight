"""
Database initialization script with sample flight data.
Run this before starting the application.
"""

from datetime import datetime, date, time
from database import engine, SessionLocal, Base
from models import Flight, Booking


def init_db():
    """Create tables and seed sample data."""
    # Create all tables
    Base.metadata.create_all(bind=engine)
    print("✓ Database tables created")

    # Check if data already exists
    db = SessionLocal()
    existing_flights = db.query(Flight).count()
    db.close()

    if existing_flights > 0:
        print("✓ Sample data already exists, skipping seed")
        return

    db = SessionLocal()
    try:
        # Real Pakistan Flights - Domestic and International
        # Covering 2 weeks from May 15 to May 24, 2026
        flights = []
        
        # Flight routes with their properties
        routes = [
            # Domestic routes
            {"origin": "Islamabad", "destination": "Lahore", "duration": 60, "price": 4500.00, "seats": 150},
            {"origin": "Lahore", "destination": "Karachi", "duration": 120, "price": 5500.00, "seats": 180},
            {"origin": "Karachi", "destination": "Islamabad", "duration": 150, "price": 5800.00, "seats": 160},
            {"origin": "Islamabad", "destination": "Peshawar", "duration": 90, "price": 3500.00, "seats": 120},
            {"origin": "Lahore", "destination": "Multan", "duration": 75, "price": 3200.00, "seats": 100},
            {"origin": "Karachi", "destination": "Quetta", "duration": 180, "price": 6500.00, "seats": 90},
            {"origin": "Peshawar", "destination": "Lahore", "duration": 90, "price": 3500.00, "seats": 120},
            {"origin": "Multan", "destination": "Karachi", "duration": 120, "price": 4200.00, "seats": 110},

            # International routes
            {"origin": "Karachi", "destination": "Dubai", "duration": 180, "price": 15500.00, "seats": 200},
            {"origin": "Lahore", "destination": "Doha", "duration": 210, "price": 16000.00, "seats": 180},
            {"origin": "Islamabad", "destination": "Doha", "duration": 210, "price": 16000.00, "seats": 200},
            {"origin": "Karachi", "destination": "Bangkok", "duration": 360, "price": 24500.00, "seats": 220},
            {"origin": "Lahore", "destination": "Dubai", "duration": 180, "price": 15500.00, "seats": 200},
            {"origin": "Islamabad", "destination": "Jeddah", "duration": 180, "price": 14500.00, "seats": 180},
            {"origin": "Dubai", "destination": "Karachi", "duration": 180, "price": 15500.00, "seats": 200},
            {"origin": "Doha", "destination": "Lahore", "duration": 210, "price": 16000.00, "seats": 180},
            {"origin": "Bangkok", "destination": "Karachi", "duration": 360, "price": 24500.00, "seats": 220},
        ]
        
        # Generate flights for each day over 2 weeks with varying times
        departure_times_morning = [time(6, 0), time(7, 0), time(8, 0), time(9, 0)]
        departure_times_afternoon = [time(12, 0), time(13, 30), time(14, 0), time(15, 30)]
        departure_times_evening = [time(18, 0), time(19, 30), time(20, 30), time(21, 0), time(22, 0), time(23, 30)]
        
        # Create flights for 2 weeks (May 15-24, 2026)
        for day_offset in range(10):  # 10 days (May 15-24)
            flight_date = date(2026, 5, 15 + day_offset)
            
            for idx, route in enumerate(routes):
                # Distribute flights across different times
                if idx % 3 == 0:
                    departure_time = departure_times_morning[day_offset % len(departure_times_morning)]
                elif idx % 3 == 1:
                    departure_time = departure_times_afternoon[day_offset % len(departure_times_afternoon)]
                else:
                    departure_time = departure_times_evening[day_offset % len(departure_times_evening)]
                
                flights.append(Flight(
                    origin=route["origin"],
                    destination=route["destination"],
                    departure_date=flight_date,
                    departure_time=departure_time,
                    duration_minutes=route["duration"],
                    price_per_seat=route["price"],
                    total_seats=route["seats"],
                    available_seats=route["seats"],
                ))

        db.add_all(flights)
        db.commit()
        print(f"✓ Added {len(flights)} sample flights across 2 weeks (May 15-24, 2026)")
        print(f"\n📋 Flight Summary:")
        print(f"  Domestic routes: 8")
        print(f"  International routes: 9")
        print(f"  Days covered: 10 days")
        print(f"  Total flight instances: {len(flights)}")
        
        # Print sample of flights
        print(f"\n📌 Sample flights:")
        for flight in flights[:10]:
            print(f"  - {flight.origin} → {flight.destination} | {flight.departure_date} at {flight.departure_time} | Rs. {flight.price_per_seat}")
        print(f"  ... and {len(flights) - 10} more flights")

    except Exception as e:
        db.rollback()
        print(f"✗ Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
    print("\n✓ Database initialization complete!")

