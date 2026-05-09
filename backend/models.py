"""
SQLAlchemy models for FlightHub.
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Date, Time, Numeric, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from database import Base


class Flight(Base):
    """Flight model."""
    __tablename__ = "flights"

    id = Column(Integer, primary_key=True, index=True)
    origin = Column(String(3), nullable=False, index=True)  # Airport code
    destination = Column(String(3), nullable=False, index=True)  # Airport code
    departure_date = Column(Date, nullable=False, index=True)
    departure_time = Column(Time, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    price_per_seat = Column(Numeric(10, 2), nullable=False)
    total_seats = Column(Integer, nullable=False)
    available_seats = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    bookings = relationship("Booking", back_populates="flight", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Flight {self.origin}-{self.destination} {self.departure_datetime}>"


class Booking(Base):
    """Booking model."""
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    booking_reference = Column(String(10), unique=True, nullable=False, index=True)
    flight_id = Column(Integer, ForeignKey("flights.id"), nullable=False, index=True)
    passenger_name = Column(String(255), nullable=False, index=True)
    passport_number = Column(String(20), nullable=False)
    seat_number = Column(Integer, nullable=False)
    status = Column(String(20), default="CONFIRMED", nullable=False)  # CONFIRMED, CANCELLED
    booked_at = Column(DateTime, default=datetime.utcnow)
    cancelled_at = Column(DateTime, nullable=True)

    # Relationships
    flight = relationship("Flight", back_populates="bookings")

    def __repr__(self):
        return f"<Booking {self.booking_reference} {self.passenger_name}>"
