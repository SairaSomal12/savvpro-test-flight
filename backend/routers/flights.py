"""
Flight routes for FlightHub API.
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import Flight
from schemas import FlightResponse, FlightListResponse, FlightSearchResponse

router = APIRouter(prefix="/api/flights", tags=["flights"])


@router.get("", response_model=FlightListResponse)
def get_all_flights(
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    departure_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get all available flights with optional filters.
    
    Query Parameters:
    - origin (optional): Filter by origin airport code (e.g., ISB, LHE, KHI)
    - destination (optional): Filter by destination airport code (e.g., DXB)
    - departure_date (optional): Filter by date in YYYY-MM-DD format
    
    Returns:
    - List of flights and count
    """
    query = db.query(Flight)
    
    # Apply filters
    if origin:
        origin = origin.upper()
        query = query.filter(Flight.origin == origin)
    
    if destination:
        destination = destination.upper()
        query = query.filter(Flight.destination == destination)
    
    if departure_date:
        try:
            from datetime import date
            date_obj = datetime.strptime(departure_date, "%Y-%m-%d").date()
            query = query.filter(Flight.departure_date == date_obj)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid departure_date format. Use YYYY-MM-DD"
            )
    
    flights = query.order_by(Flight.departure_date, Flight.departure_time).all()
    
    return {
        "flights": flights,
        "count": len(flights)
    }


@router.get("/search", response_model=FlightSearchResponse)
def search_flights(
    origin: str,
    destination: str,
    departure_date: str,
    db: Session = Depends(get_db)
):
    """
    Search flights by origin, destination, and departure date.
    
    Query Parameters:
    - origin (required): Origin airport code (e.g., ISB, LHE, KHI)
    - destination (required): Destination airport code (e.g., DXB, DOH)
    - departure_date (required): Date in YYYY-MM-DD format
    
    Returns:
    - List of matching flights
    - 400 Bad Request: Invalid parameters
    - 404 Not Found: No matching flights
    """
    # Validate required parameters
    if not origin or not destination or not departure_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="origin, destination, and departure_date are required"
        )
    
    # Parse date
    try:
        from datetime import date
        date_obj = datetime.strptime(departure_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid departure_date format. Use YYYY-MM-DD"
        )
    
    # Search flights
    origin = origin.upper()
    destination = destination.upper()
    
    flights = db.query(Flight).filter(
        Flight.origin == origin,
        Flight.destination == destination,
        Flight.departure_date == date_obj
    ).order_by(Flight.departure_time).all()
    
    # Return 404 if no flights found
    if not flights:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No flights found from {origin} to {destination} on {departure_date}"
        )
    
    return {
        "results": flights,
        "count": len(flights)
    }


@router.get("/{flight_id}", response_model=FlightResponse)
def get_flight(flight_id: int, db: Session = Depends(get_db)):
    """
    Get a specific flight by ID.
    
    Parameters:
    - flight_id: Flight ID
    
    Returns:
    - Flight details
    - 404 Not Found: Flight not found
    """
    flight = db.query(Flight).filter(Flight.id == flight_id).first()
    
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Flight with ID {flight_id} not found"
        )
    
    return flight
