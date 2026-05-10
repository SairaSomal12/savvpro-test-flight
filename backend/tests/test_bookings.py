"""
Tests for booking creation, cancellation, and the business rules around them.

Two of these tests cover the core business rules from the brief:
  - test_overbooking_is_rejected_when_flight_is_full   (no overbooking)
  - test_cancellation_frees_the_seat_for_rebooking     (cancel restores capacity)
"""


# ─── Happy path ────────────────────────────────────────────────────────────

def test_booking_succeeds_and_decrements_seats(client, small_flight):
    """A successful booking returns 201, generates a reference, and decrements available_seats."""
    resp = client.post("/api/bookings", json={
        "flight_id": small_flight.id,
        "passenger_name": "Fatima Khan",
        "passport_number": "AB123456",
        "seat_number": 1,
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "CONFIRMED"
    assert body["seat_number"] == 1
    assert body["booking_reference"].startswith("BK-")

    # Side effect: the flight's available_seats went from 3 → 2
    flight = client.get(f"/api/flights/{small_flight.id}").json()
    assert flight["available_seats"] == 2


# ─── Business rule: no overbooking ─────────────────────────────────────────

def test_overbooking_is_rejected_when_flight_is_full(client, small_flight):
    """
    BUSINESS RULE — When a flight is fully booked, the next booking attempt
    must return 409 Conflict. Overbooking is never allowed.
    """
    # Fill the 3-seat flight to capacity
    for seat in (1, 2, 3):
        resp = client.post("/api/bookings", json={
            "flight_id": small_flight.id,
            "passenger_name": f"Pax {seat}",
            "passport_number": f"P{seat}",
            "seat_number": seat,
        })
        assert resp.status_code == 201

    # Sanity check: the flight is now fully booked
    flight = client.get(f"/api/flights/{small_flight.id}").json()
    assert flight["available_seats"] == 0

    # The 4th attempt — regardless of which seat number is requested — must be rejected
    resp = client.post("/api/bookings", json={
        "flight_id": small_flight.id,
        "passenger_name": "Late Arrival",
        "passport_number": "X",
        "seat_number": 1,
    })
    assert resp.status_code == 409
    detail = resp.json()["detail"].lower()
    # Either "fully booked" (capacity) or "already booked" (specific seat) is acceptable
    assert "fully booked" in detail or "already booked" in detail


# ─── Business rule: cancellation restores capacity ─────────────────────────

def test_cancellation_frees_the_seat_for_rebooking(client, small_flight):
    """
    BUSINESS RULE — Cancelling a booking must increment the flight's
    available_seats and free up the specific seat for re-booking.
    """
    # Book seat 1
    book = client.post("/api/bookings", json={
        "flight_id": small_flight.id,
        "passenger_name": "Original",
        "passport_number": "P1",
        "seat_number": 1,
    }).json()
    assert client.get(f"/api/flights/{small_flight.id}").json()["available_seats"] == 2

    # Cancel
    cancel = client.delete(f"/api/bookings/{book['booking_reference']}")
    assert cancel.status_code == 200
    assert cancel.json()["refund_amount"] == 4500.00

    # Capacity is restored
    assert client.get(f"/api/flights/{small_flight.id}").json()["available_seats"] == 3

    # Re-booking the same seat now succeeds
    rebook = client.post("/api/bookings", json={
        "flight_id": small_flight.id,
        "passenger_name": "Replacement",
        "passport_number": "P2",
        "seat_number": 1,
    })
    assert rebook.status_code == 201


# ─── Edge cases / validation ───────────────────────────────────────────────

def test_double_booking_same_seat_returns_409(client, small_flight):
    """Two CONFIRMED bookings for the same seat number on the same flight is rejected."""
    client.post("/api/bookings", json={
        "flight_id": small_flight.id,
        "passenger_name": "First",
        "passport_number": "P1",
        "seat_number": 2,
    })
    resp = client.post("/api/bookings", json={
        "flight_id": small_flight.id,
        "passenger_name": "Second",
        "passport_number": "P2",
        "seat_number": 2,
    })
    assert resp.status_code == 409
    assert "already booked" in resp.json()["detail"].lower()


def test_seat_out_of_range_returns_400(client, small_flight):
    """Seat numbers must be within 1..total_seats."""
    resp = client.post("/api/bookings", json={
        "flight_id": small_flight.id,
        "passenger_name": "Out Of Bounds",
        "passport_number": "P",
        "seat_number": 99,  # the small_flight has only 3 seats
    })
    assert resp.status_code == 400
    assert "between 1 and 3" in resp.json()["detail"]


def test_cancelling_already_cancelled_booking_returns_400(client, small_flight):
    """Cancelling twice is a 400 — not silently idempotent."""
    book = client.post("/api/bookings", json={
        "flight_id": small_flight.id,
        "passenger_name": "X",
        "passport_number": "P",
        "seat_number": 1,
    }).json()

    assert client.delete(f"/api/bookings/{book['booking_reference']}").status_code == 200
    resp = client.delete(f"/api/bookings/{book['booking_reference']}")
    assert resp.status_code == 400


def test_cancelling_unknown_reference_returns_404(client):
    """Cancelling a non-existent booking reference is a 404."""
    resp = client.delete("/api/bookings/BK-NOPE99")
    assert resp.status_code == 404


def test_pydantic_validation_returns_422_when_field_missing(client, small_flight):
    """Missing required fields are caught by Pydantic and returned as 422."""
    resp = client.post("/api/bookings", json={
        "flight_id": small_flight.id,
        "passport_number": "P",
        "seat_number": 1,
        # passenger_name deliberately omitted
    })
    assert resp.status_code == 422
