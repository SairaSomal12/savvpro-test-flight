"""
Tests for the flight listing and search endpoints.
"""
from datetime import date, time

from models import Flight


def _seed_two_flights(db):
    db.add_all([
        Flight(
            origin="Islamabad", destination="Lahore",
            departure_date=date(2026, 5, 15), departure_time=time(6, 0),
            duration_minutes=60, price_per_seat=4500.00,
            total_seats=150, available_seats=150,
        ),
        Flight(
            origin="Karachi", destination="Dubai",
            departure_date=date(2026, 5, 16), departure_time=time(8, 0),
            duration_minutes=180, price_per_seat=15500.00,
            total_seats=200, available_seats=200,
        ),
    ])
    db.commit()


def test_list_flights_returns_all_when_unfiltered(client, db):
    _seed_two_flights(db)
    resp = client.get("/api/flights")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2


def test_list_flights_filters_by_origin_case_insensitively(client, db):
    """Cities are stored case-sensitive but matched case-insensitively (ILIKE)."""
    _seed_two_flights(db)
    resp = client.get("/api/flights", params={"origin": "ISLAMABAD"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 1
    assert body["flights"][0]["origin"] == "Islamabad"


def test_search_returns_404_when_no_match(client, db):
    """
    Strict /search returns 404 — not an empty 200 — so the UI can branch on
    HTTP status alone without inspecting the response body.
    """
    _seed_two_flights(db)
    resp = client.get("/api/flights/search", params={
        "origin": "Tokyo",
        "destination": "Sydney",
        "departure_date": "2026-05-15",
    })
    assert resp.status_code == 404


def test_invalid_date_format_returns_400_with_clear_message(client):
    """Bad date strings are caught with a 400 and a message that names the format."""
    resp = client.get("/api/flights", params={"departure_date": "yesterday"})
    assert resp.status_code == 400
    assert "yyyy-mm-dd" in resp.json()["detail"].lower()
