"""
Shared pytest fixtures for the FlightHub test suite.

Tests run against an isolated SQLite file (test_flighthub.db) so the production
database is never touched. The DATABASE_URL env var is set BEFORE any backend
modules are imported, so the backend's engine is constructed against the test
database from the very first import.
"""
import os
import sys

# 1. Point the backend at a separate test database BEFORE any backend imports.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
TEST_DB = os.path.join(_THIS_DIR, "test_flighthub.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"

# 2. Make `backend/` importable when pytest is invoked from anywhere.
sys.path.insert(0, os.path.abspath(os.path.join(_THIS_DIR, "..")))

# 3. Wipe any leftover test DB from a previous run.
if os.path.exists(TEST_DB):
    os.remove(TEST_DB)

# 4. Now safe to import — the engine inside `database.py` will use TEST_DB.
from datetime import date, time

import pytest
from fastapi.testclient import TestClient

from main import app
from database import engine, Base, SessionLocal
from models import Flight


@pytest.fixture(autouse=True)
def reset_db():
    """Drop and recreate the schema before every test for full isolation."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    """FastAPI TestClient — exercises endpoints in-process, no network needed."""
    return TestClient(app)


@pytest.fixture
def db():
    """Direct DB session for inserting fixtures or asserting on persisted state."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def small_flight(db):
    """
    A 3-seat flight — small enough to exhaust capacity within a single test,
    which is exactly what the overbooking rule needs.
    """
    flight = Flight(
        origin="Islamabad",
        destination="Lahore",
        departure_date=date(2026, 5, 15),
        departure_time=time(6, 0),
        duration_minutes=60,
        price_per_seat=4500.00,
        total_seats=3,
        available_seats=3,
    )
    db.add(flight)
    db.commit()
    db.refresh(flight)
    return flight


def pytest_sessionfinish(session, exitstatus):
    """Remove the test DB file at the end of the test run."""
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)
