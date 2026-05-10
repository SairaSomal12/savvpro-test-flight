/**
 * FlightHub Frontend - Client Side JavaScript
 */

// Use relative URLs to go through Express proxy server
const API_BASE = '/api';
let currentFlight = null;
let currentSeatLimit = 0;
let bookingsCache = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('departure-date');
    if (dateInput) {
        dateInput.min = today;
        dateInput.value = today; // Set default to today
    }
    
    // Auto-uppercase airport codes
    document.querySelectorAll('.input-uppercase').forEach(input => {
        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    });
});

/**
 * Tab Navigation
 */
function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(tabName + '-tab').classList.add('active');
    document.getElementById('nav-' + tabName).classList.add('active');

    if (tabName === 'bookings') {
        getAllBookings();
    }
}

/**
 * Search Flights
 */
document.getElementById('search-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const origin = document.getElementById('origin').value.trim();
    const destination = document.getElementById('destination').value.trim();
    const departureDate = document.getElementById('departure-date').value;
    
    // Call searchFlights with optional parameters
    await searchFlights(origin, destination, departureDate);
});

async function searchFlights(origin, destination, departureDate) {
    const loading = document.getElementById('loading');
    const results = document.getElementById('search-results');
    const noResults = document.getElementById('no-results');
    const errorDiv = document.getElementById('error-message');
    
    loading.classList.remove('hidden');
    results.classList.add('hidden');
    noResults.classList.add('hidden');
    errorDiv.classList.add('hidden');
    
    try {
        // Build query string with only non-empty parameters
        const params = new URLSearchParams();
        if (origin) params.append('origin', origin);
        if (destination) params.append('destination', destination);
        if (departureDate) params.append('departure_date', departureDate);
        
        const queryString = params.toString() ? `?${params.toString()}` : '';
        const response = await fetch(`${API_BASE}/flights${queryString}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Search failed');
        }
        
        if (data.flights && data.flights.length > 0) {
            displayFlights(data.flights);
            results.classList.remove('hidden');
        } else {
            noResults.classList.remove('hidden');
        }
    } catch (error) {
        showError(error.message);
    } finally {
        loading.classList.add('hidden');
    }
}

/**
 * Display Flights
 */
function displayFlights(flights) {
    const container = document.getElementById('flights-list');
    container.innerHTML = '';
    
    flights.forEach(flight => {
        const flightCard = document.createElement('div');
        flightCard.className = 'flight-card';
        
        const departureTime = new Date(`2026-05-15T${flight.departure_time}`);
        const timeString = departureTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        
        const durationHours = Math.floor(flight.duration_minutes / 60);
        const durationMins = flight.duration_minutes % 60;
        const durationString = durationHours > 0 ? `${durationHours}h ${durationMins}m` : `${durationMins}m`;
        
        flightCard.innerHTML = `
            <div class="flight-header">
                <h3>${flight.origin} → ${flight.destination}</h3>
                <span class="flight-date">${flight.departure_date}</span>
            </div>
            
            <div class="flight-info">
                <div class="info-item">
                    <span class="label">Departure</span>
                    <span class="value">${timeString}</span>
                </div>
                <div class="info-item">
                    <span class="label">Duration</span>
                    <span class="value">${durationString}</span>
                </div>
                <div class="info-item">
                    <span class="label">Price</span>
                    <span class="value">Rs. ${parseFloat(flight.price_per_seat).toLocaleString()}</span>
                </div>
                <div class="info-item">
                    <span class="label">Available Seats</span>
                    <span class="value ${flight.available_seats > 0 ? 'seats-available' : 'seats-full'}">${flight.available_seats}/${flight.total_seats}</span>
                </div>
            </div>
            
            <div class="flight-actions">
                ${flight.available_seats > 0 ? `
                    <button class="btn btn-book" onclick="openBookingModal(${JSON.stringify(flight).replace(/"/g, '&quot;')})">
                        Book Now
                    </button>
                ` : `
                    <button class="btn btn-disabled" disabled>No Seats Available</button>
                `}
            </div>
        `;
        
        container.appendChild(flightCard);
    });
}

/**
 * Booking Modal
 */
function openBookingModal(flight) {
    currentFlight = flight;
    currentSeatLimit = flight.total_seats;
    
    const modal = document.getElementById('booking-modal');
    const details = document.getElementById('flight-details');
    
    const departureTime = new Date(`2026-05-15T${flight.departure_time}`);
    const timeString = departureTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    details.innerHTML = `
        <p><strong>${flight.origin} → ${flight.destination}</strong></p>
        <p>Date: ${flight.departure_date} at ${timeString}</p>
        <p>Price: Rs. ${parseFloat(flight.price_per_seat).toLocaleString()} per seat</p>
        <p>Available Seats: ${flight.available_seats}/${flight.total_seats}</p>
    `;
    
    // Set seat number max value
    document.getElementById('seat-number').max = flight.total_seats;
    
    // Clear form
    document.getElementById('booking-form').reset();
    document.getElementById('booking-error').classList.add('hidden');
    document.getElementById('booking-success').classList.add('hidden');
    
    modal.classList.remove('hidden');
}

function closeBookingModal() {
    document.getElementById('booking-modal').classList.add('hidden');
}

/**
 * Submit Booking
 */
async function submitBooking(e) {
    e.preventDefault();
    
    const passengerName = document.getElementById('passenger-name-input').value.trim();
    const passportNumber = document.getElementById('passport-number').value.trim();
    const seatNumber = parseInt(document.getElementById('seat-number').value);
    
    if (!currentFlight) {
        showBookingError('Flight not selected');
        return;
    }
    
    if (!passengerName || !passportNumber || !seatNumber) {
        showBookingError('Please fill in all fields');
        return;
    }
    
    if (seatNumber < 1 || seatNumber > currentSeatLimit) {
        showBookingError(`Seat number must be between 1 and ${currentSeatLimit}`);
        return;
    }
    
    const loading = document.getElementById('booking-loading');
    const errorDiv = document.getElementById('booking-error');
    const successDiv = document.getElementById('booking-success');
    
    loading.classList.remove('hidden');
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_BASE}/bookings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                flight_id: currentFlight.id,
                passenger_name: passengerName,
                passport_number: passportNumber,
                seat_number: seatNumber
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || data.message || 'Booking failed');
        }
        
        // Show success message
        document.getElementById('booking-ref-display').textContent = `Your booking reference: ${data.booking_reference}`;
        document.getElementById('booking-form').classList.add('hidden');
        successDiv.classList.remove('hidden');
        
    } catch (error) {
        showBookingError(error.message);
    } finally {
        loading.classList.add('hidden');
    }
}

/**
 * Get All Bookings
 */
async function getAllBookings() {
    const loading = document.getElementById('bookings-loading');
    const results = document.getElementById('bookings-results');
    const errorDiv = document.getElementById('bookings-error');
    const noResults = document.getElementById('bookings-no-results');
    const bookingsContainer = document.getElementById('bookings-container');
    
    if (!loading || !results) {
        console.error('Booking elements not found');
        return;
    }
    
    loading.classList.remove('hidden');
    results.classList.add('hidden');
    errorDiv.classList.add('hidden');
    if (noResults) noResults.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_BASE}/bookings`);
        const data = await response.json();
        
        if (!response.ok) {
            // If 404, it means no bookings exist
            if (response.status === 404) {
                if (noResults) noResults.classList.remove('hidden');
                loading.classList.add('hidden');
                return;
            }
            throw new Error(data.detail || 'Failed to load bookings');
        }
        
        if (data.bookings && data.bookings.length > 0) {
            displayBookings(data, 'all');
            results.classList.remove('hidden');
        } else {
            if (noResults) noResults.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error fetching bookings:', error);
        showBookingsError(error.message);
    } finally {
        loading.classList.add('hidden');
    }
}

/**
 * Search Bookings
 */
async function searchBookings() {
    const bookingRef = document.getElementById('booking-ref').value.trim();
    const passengerName = document.getElementById('passenger-name').value.trim();
    
    if (!bookingRef && !passengerName) {
        showBookingsError('Enter booking reference or passenger name');
        return;
    }
    
    const loading = document.getElementById('bookings-loading');
    const results = document.getElementById('bookings-results');
    const errorDiv = document.getElementById('bookings-error');
    
    loading.classList.remove('hidden');
    results.classList.add('hidden');
    errorDiv.classList.add('hidden');
    
    try {
        let url;
        if (bookingRef) {
            url = `${API_BASE}/bookings/${bookingRef}`;
        } else {
            url = `${API_BASE}/bookings/passenger/${encodeURIComponent(passengerName)}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Search failed');
        }
        
        displayBookings(data, bookingRef ? 'single' : 'list');
        results.classList.remove('hidden');
        
    } catch (error) {
        showBookingsError(error.message);
    } finally {
        loading.classList.add('hidden');
    }
}

/**
 * Display Bookings (compact grid cards)
 */
function displayBookings(data, type) {
    const container = document.getElementById('bookings-list');
    container.innerHTML = '';
    bookingsCache = {};

    const bookings = type === 'single' ? [data] : data.bookings;

    bookings.forEach(booking => {
        bookingsCache[booking.booking_reference] = booking;

        const card = document.createElement('div');
        card.className = 'booking-card-compact';

        const departureTime = new Date(`2026-05-15T${booking.flight.departure_time}`);
        const timeString = departureTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        card.innerHTML = `
            <div class="compact-card-header">
                <span class="compact-ref">${booking.booking_reference}</span>
                <span class="booking-status ${booking.status === 'CANCELLED' ? 'cancelled' : 'confirmed'}">${booking.status}</span>
            </div>
            <div class="compact-route">${booking.flight.origin} → ${booking.flight.destination}</div>
            <div class="compact-details">
                <div class="compact-detail-row">
                    <span class="label">Departure</span>
                    <span class="value">${booking.flight.departure_date} at ${timeString}</span>
                </div>
                <div class="compact-detail-row">
                    <span class="label">Passenger</span>
                    <span class="value">${booking.passenger_name}</span>
                </div>
                <div class="compact-detail-row">
                    <span class="label">Seat</span>
                    <span class="value">#${booking.seat_number}</span>
                </div>
            </div>
            <div class="compact-actions">
                <button class="btn btn-info" onclick="reviewBooking('${booking.booking_reference}')">Review Details</button>
                ${booking.status === 'CONFIRMED' ? `
                    <button class="btn btn-danger" onclick="cancelBooking('${booking.booking_reference}')">Cancel</button>
                ` : ''}
            </div>
        `;

        container.appendChild(card);
    });
}

/**
 * Review Booking — opens the detail modal
 */
function reviewBooking(bookingRef) {
    const booking = bookingsCache[bookingRef];
    if (!booking) return;

    const departureTime = new Date(`2026-05-15T${booking.flight.departure_time}`);
    const timeString = departureTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const durationHours = Math.floor(booking.flight.duration_minutes / 60);
    const durationMins = booking.flight.duration_minutes % 60;

    document.getElementById('detail-booking-ref').textContent = booking.booking_reference;
    const statusEl = document.getElementById('detail-status');
    statusEl.textContent = booking.status;
    statusEl.className = `booking-status ${booking.status === 'CANCELLED' ? 'cancelled' : 'confirmed'}`;
    document.getElementById('detail-route').innerHTML = `<strong>${booking.flight.origin} → ${booking.flight.destination}</strong>`;
    document.getElementById('detail-departure').textContent = `${booking.flight.departure_date} at ${timeString}`;
    document.getElementById('detail-duration').textContent = `${durationHours}h ${durationMins}m`;
    document.getElementById('detail-passenger').textContent = booking.passenger_name;
    document.getElementById('detail-passport').textContent = booking.passport_number;
    document.getElementById('detail-seat').textContent = `#${booking.seat_number}`;
    document.getElementById('detail-price').textContent = `Rs. ${parseFloat(booking.flight.price_per_seat).toLocaleString()}`;
    document.getElementById('detail-booked-at').textContent = new Date(booking.booked_at).toLocaleString();

    const cancelledRow = document.getElementById('detail-cancelled-row');
    if (booking.cancelled_at) {
        cancelledRow.classList.remove('hidden');
        document.getElementById('detail-cancelled-at').textContent = new Date(booking.cancelled_at).toLocaleString();
    } else {
        cancelledRow.classList.add('hidden');
    }

    const cancelBtn = document.getElementById('detail-cancel-btn');
    if (booking.status === 'CONFIRMED') {
        cancelBtn.classList.remove('hidden');
        cancelBtn.onclick = () => {
            closeBookingDetailModal();
            cancelBooking(bookingRef);
        };
    } else {
        cancelBtn.classList.add('hidden');
    }

    document.getElementById('booking-detail-modal').classList.remove('hidden');
}

function closeBookingDetailModal() {
    document.getElementById('booking-detail-modal').classList.add('hidden');
}

/**
 * Cancel Booking
 */
async function cancelBooking(bookingRef) {
    if (!confirm('Are you sure you want to cancel this booking?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/bookings/${bookingRef}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Cancellation failed');
        }
        
        alert(`✅ Booking cancelled successfully!\nRefund amount: Rs. ${parseFloat(data.refund_amount).toLocaleString()}`);
        getAllBookings();
        
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
}

/**
 * Error Handlers
 */
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    document.getElementById('error-text').textContent = message;
    errorDiv.classList.remove('hidden');
}

function showBookingError(message) {
    const errorDiv = document.getElementById('booking-error');
    document.getElementById('booking-error-text').textContent = message;
    errorDiv.classList.remove('hidden');
}

function showBookingsError(message) {
    const errorDiv = document.getElementById('bookings-error');
    document.getElementById('bookings-error-text').textContent = message;
    errorDiv.classList.remove('hidden');
}
