"""
Pydantic schemas for request/response validation.
"""

from datetime import datetime, date, time
from typing import Optional, List
from pydantic import BaseModel, Field


# Flight Schemas
class FlightBase(BaseModel):
    """Base flight schema."""
    origin: str = Field(..., min_length=3, max_length=3, description="Airport code (3 letters)")
    destination: str = Field(..., min_length=3, max_length=3, description="Airport code (3 letters)")
    departure_date: date
    departure_time: time
    duration_minutes: int = Field(..., gt=0)
    price_per_seat: float = Field(..., gt=0)
    total_seats: int = Field(..., gt=0)
    available_seats: int = Field(..., ge=0)


class FlightCreate(FlightBase):
    """Schema for creating a flight."""
    pass


class FlightResponse(FlightBase):
    """Schema for flight response."""
    id: int

    class Config:
        from_attributes = True


class FlightListResponse(BaseModel):
    """Response for listing flights."""
    flights: List[FlightResponse]
    count: int


class FlightSearchResponse(BaseModel):
    """Response for flight search."""
    results: List[FlightResponse]
    count: int


# Booking Schemas
class BookingBase(BaseModel):
    """Base booking schema."""
    flight_id: int
    passenger_name: str = Field(..., min_length=1, max_length=255)
    passport_number: str = Field(..., min_length=1, max_length=20)
    seat_number: int = Field(..., gt=0)


class BookingCreate(BookingBase):
    """Schema for creating a booking."""
    pass


class BookingResponse(BaseModel):
    """Schema for booking response."""
    id: int
    booking_reference: str
    flight_id: int
    passenger_name: str
    passport_number: str
    seat_number: int
    status: str
    booked_at: datetime
    cancelled_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BookingDetailResponse(BaseModel):
    """Schema for booking details with flight info."""
    booking_reference: str
    flight: FlightResponse
    passenger_name: str
    passport_number: str
    seat_number: int
    status: str
    booked_at: datetime
    cancelled_at: Optional[datetime] = None


class BookingListResponse(BaseModel):
    """Response for listing bookings by passenger."""
    passenger_name: str
    bookings: List[BookingDetailResponse]


class AllBookingsResponse(BaseModel):
    """Response for listing all bookings."""
    bookings: List[BookingDetailResponse]
    count: int


class CancellationResponse(BaseModel):
    """Response for cancellation."""
    message: str
    booking_reference: str
    refund_amount: float


# Error Response
class ErrorResponse(BaseModel):
    """Error response schema."""
    error: bool = True
    status_code: int
    message: str
    details: Optional[dict] = None
