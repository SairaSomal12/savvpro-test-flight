"""
Booking routes for FlightHub API.
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from models import Flight, Booking
from schemas import BookingCreate, BookingResponse, BookingDetailResponse, BookingListResponse, AllBookingsResponse, CancellationResponse
import random
import string

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


def generate_booking_reference():
    """Generate a unique booking reference."""
    # Format: BK-XXXXXX (6 random alphanumeric characters)
    chars = string.ascii_uppercase + string.digits
    random_part = ''.join(random.choices(chars, k=6))
    return f"BK-{random_part}"


@router.post("", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
def create_booking(booking: BookingCreate, db: Session = Depends(get_db)):
    """
    Create a new booking.
    
    Request Body:
    - flight_id (required): ID of the flight
    - passenger_name (required): Full name of passenger
    - passport_number (required): Passport number
    - seat_number (required): Seat number (1 to total_seats)
    
    Returns:
    - Booking details with booking reference
    - 400 Bad Request: Invalid seat, no seats available, or seat already booked
    - 404 Not Found: Flight not found
    """
    # Get flight
    flight = db.query(Flight).filter(Flight.id == booking.flight_id).first()
    
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Flight with ID {booking.flight_id} not found"
        )
    
    # Validate seat number is within the aircraft's range
    if not (1 <= booking.seat_number <= flight.total_seats):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Seat number must be between 1 and {flight.total_seats}"
        )

    # Reject immediately if the specific seat is already confirmed
    # (fast path — avoids touching available_seats for an obviously taken seat)
    if db.query(Booking).filter(
        Booking.flight_id == booking.flight_id,
        Booking.seat_number == booking.seat_number,
        Booking.status == "CONFIRMED"
    ).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Seat {booking.seat_number} is already booked. Please choose a different seat."
        )

    # Atomic capacity guard: decrement only succeeds when available_seats > 0.
    # The WHERE clause makes this a compare-and-decrement — immune to race conditions
    # because SQLite serialises writes and the condition is evaluated inside the UPDATE.
    rows_updated = db.query(Flight).filter(
        Flight.id == booking.flight_id,
        Flight.available_seats > 0
    ).update(
        {"available_seats": Flight.available_seats - 1},
        synchronize_session="fetch"
    )

    if rows_updated == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This flight is fully booked. No seats are available."
        )

    # Create the booking record
    booking_reference = generate_booking_reference()
    new_booking = Booking(
        booking_reference=booking_reference,
        flight_id=booking.flight_id,
        passenger_name=booking.passenger_name,
        passport_number=booking.passport_number,
        seat_number=booking.seat_number,
        status="CONFIRMED"
    )
    db.add(new_booking)

    try:
        db.commit()
    except Exception:
        # Last-resort catch: two requests beat all checks simultaneously.
        # Roll back the seat decrement we already applied and surface a clear error.
        db.rollback()
        db.query(Flight).filter(Flight.id == booking.flight_id).update(
            {"available_seats": Flight.available_seats + 1},
            synchronize_session=False
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Seat {booking.seat_number} was just taken by another booking. Please select a different seat."
        )

    db.refresh(new_booking)
    return new_booking


@router.get("", response_model=AllBookingsResponse)
def get_all_bookings(db: Session = Depends(get_db)):
    """
    Get all bookings in the system.
    
    Returns:
    - List of all bookings with flight details
    - 404 Not Found: No bookings found
    """
    bookings = db.query(Booking).all()
    
    if not bookings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No bookings found"
        )
    
    booking_details = []
    for booking in bookings:
        booking_details.append({
            "booking_reference": booking.booking_reference,
            "flight": booking.flight,
            "passenger_name": booking.passenger_name,
            "passport_number": booking.passport_number,
            "seat_number": booking.seat_number,
            "status": booking.status,
            "booked_at": booking.booked_at,
            "cancelled_at": booking.cancelled_at
        })

    return {
        "bookings": booking_details,
        "count": len(booking_details)
    }


@router.get("/{booking_reference}", response_model=BookingDetailResponse)
def get_booking(booking_reference: str, db: Session = Depends(get_db)):
    """
    Get a booking by reference.
    
    Parameters:
    - booking_reference: Booking reference (e.g., BK-ABC123)
    
    Returns:
    - Booking details with flight information
    - 404 Not Found: Booking not found
    """
    booking = db.query(Booking).filter(
        Booking.booking_reference == booking_reference.upper()
    ).first()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Booking with reference {booking_reference} not found"
        )
    
    return {
        "booking_reference": booking.booking_reference,
        "flight": booking.flight,
        "passenger_name": booking.passenger_name,
        "passport_number": booking.passport_number,
        "seat_number": booking.seat_number,
        "status": booking.status,
        "booked_at": booking.booked_at,
        "cancelled_at": booking.cancelled_at
    }


@router.get("/passenger/{passenger_name}", response_model=BookingListResponse)
def get_bookings_by_passenger(passenger_name: str, db: Session = Depends(get_db)):
    """
    Get all bookings for a passenger by name.
    
    Parameters:
    - passenger_name: Passenger full name
    
    Returns:
    - List of bookings for the passenger
    - 404 Not Found: No bookings found for this passenger
    """
    bookings = db.query(Booking).filter(
        Booking.passenger_name.ilike(f"%{passenger_name}%")
    ).all()
    
    if not bookings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No bookings found for passenger '{passenger_name}'"
        )
    
    booking_details = []
    for booking in bookings:
        booking_details.append({
            "booking_reference": booking.booking_reference,
            "flight": booking.flight,
            "passenger_name": booking.passenger_name,
            "passport_number": booking.passport_number,
            "seat_number": booking.seat_number,
            "status": booking.status,
            "booked_at": booking.booked_at,
            "cancelled_at": booking.cancelled_at
        })

    return {
        "passenger_name": passenger_name,
        "bookings": booking_details
    }


@router.delete("/{booking_reference}", response_model=CancellationResponse)
def cancel_booking(booking_reference: str, db: Session = Depends(get_db)):
    """
    Cancel a booking by reference.
    
    Parameters:
    - booking_reference: Booking reference to cancel
    
    Returns:
    - Cancellation confirmation with refund amount
    - 404 Not Found: Booking not found
    - 400 Bad Request: Booking already cancelled
    """
    booking = db.query(Booking).filter(
        Booking.booking_reference == booking_reference.upper()
    ).first()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Booking with reference {booking_reference} not found"
        )
    
    if booking.status == "CANCELLED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This booking is already cancelled"
        )
    
    # Update booking status
    booking.status = "CANCELLED"
    booking.cancelled_at = datetime.utcnow()

    # Capped atomic increment: available_seats can never exceed total_seats,
    # guarding against double-cancel replays or data inconsistencies.
    db.execute(
        text("UPDATE flights SET available_seats = MIN(available_seats + 1, total_seats) WHERE id = :id"),
        {"id": booking.flight_id}
    )

    db.commit()

    # Reload flight to get the committed available_seats value for the response
    db.refresh(booking)
    flight = db.query(Flight).filter(Flight.id == booking.flight_id).first()

    return {
        "message": "Booking cancelled successfully",
        "booking_reference": booking.booking_reference,
        "refund_amount": float(flight.price_per_seat)
    }
