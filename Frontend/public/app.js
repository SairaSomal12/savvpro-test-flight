/**
 * FlightHub Frontend - Client Side JavaScript
 */

// Use relative URLs to go through Express proxy server
const API_BASE = '/api';
let currentFlight = null;
let currentSeatLimit = 0;

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
    // Hide all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.add('hidden');
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabName + '-tab').classList.remove('hidden');
    document.getElementById('nav-' + tabName).classList.add('active');
}

/**
 * Search Flights
 */
document.getElementById('search-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const origin = document.getElementById('origin').value.trim();
    const destination = document.getElementById('destination').value.trim();
    const departureDate = document.getElementById('departure-date').value;
    
    if (!origin || !destination || !departureDate) {
        showError('Please fill in all search fields');
        return;
    }
    
    // Convert date to yyyy-mm-dd format (HTML date input returns this format)
    // departureDate is already in yyyy-mm-dd format from the input
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
        const response = await fetch(`${API_BASE}/flights/search?origin=${origin}&destination=${destination}&departure_date=${departureDate}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Search failed');
        }
        
        if (data.results && data.results.length > 0) {
            displayFlights(data.results);
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
 * Display Bookings
 */
function displayBookings(data, type) {
    const container = document.getElementById('bookings-list');
    container.innerHTML = '';
    
    const bookings = type === 'single' ? [data] : data.bookings;
    
    bookings.forEach(booking => {
        const bookingCard = document.createElement('div');
        bookingCard.className = 'booking-card';
        
        const departureTime = new Date(`2026-05-15T${booking.flight.departure_time}`);
        const timeString = departureTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        
        bookingCard.innerHTML = `
            <div class="booking-header">
                <h3>Booking: ${booking.booking_reference}</h3>
                <span class="booking-status ${booking.status === 'CANCELLED' ? 'cancelled' : 'confirmed'}">${booking.status}</span>
            </div>
            
            <div class="booking-info">
                <div class="info-group">
                    <span class="label">Flight</span>
                    <span class="value">${booking.flight.origin} → ${booking.flight.destination}</span>
                </div>
                <div class="info-group">
                    <span class="label">Date & Time</span>
                    <span class="value">${booking.flight.departure_date} at ${timeString}</span>
                </div>
                <div class="info-group">
                    <span class="label">Passenger</span>
                    <span class="value">${booking.passenger_name}</span>
                </div>
                <div class="info-group">
                    <span class="label">Seat</span>
                    <span class="value">${booking.seat_number}</span>
                </div>
                <div class="info-group">
                    <span class="label">Price</span>
                    <span class="value">Rs. ${parseFloat(booking.flight.price_per_seat).toLocaleString()}</span>
                </div>
            </div>
            
            <div class="booking-actions">
                ${booking.status === 'CONFIRMED' ? `
                    <button class="btn btn-danger" onclick="cancelBooking('${booking.booking_reference}')">
                        Cancel Booking
                    </button>
                ` : ''}
            </div>
        `;
        
        container.appendChild(bookingCard);
    });
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
        searchBookings();
        
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
