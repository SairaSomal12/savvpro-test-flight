"""
FlightHub Backend - FastAPI Application
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from models import Flight, Booking  # Import models to register them

# Initialize database
init_db()

# Create FastAPI app
app = FastAPI(
    title="FlightHub API",
    description="Flight search and booking system API",
    version="1.0.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    """API health check."""
    return {"message": "FlightHub API is running", "version": "1.0.0"}


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


# Import and include API route handlers
from routers import flights, bookings
app.include_router(flights.router)
app.include_router(bookings.router)
