/**
 * FlightHub Frontend - Client Side JavaScript
 */

// ── Landing page ──────────────────────────────────────────────────────────
(function () {
    // Populate star field
    const starsEl = document.getElementById('lp-stars');
    if (starsEl) {
        for (let i = 0; i < 80; i++) {
            const s = document.createElement('div');
            s.className = 'lp-star';
            const size = Math.random() * 2.4 + 0.6;
            s.style.cssText = [
                `width:${size}px`,
                `height:${size}px`,
                `top:${Math.random() * 100}%`,
                `left:${Math.random() * 100}%`,
                `--dur:${(Math.random() * 2 + 1.2).toFixed(2)}s`,
                `--delay:${(Math.random() * 2).toFixed(2)}s`,
            ].join(';');
            starsEl.appendChild(s);
        }
    }

    // Fade out and remove overlay after animations finish
    const overlay = document.getElementById('landing-overlay');
    if (overlay) {
        setTimeout(() => {
            overlay.classList.add('lp-fade-out');
            setTimeout(() => overlay.remove(), 950);
        }, 4000);
    }
}());
// ── End landing page ──────────────────────────────────────────────────────

// Use relative URLs to go through Express proxy server
const API_BASE = '/api';
let currentFlight = null;
let currentSeatLimit = 0;
let bookingsCache = {};
let currentSelectedSeat = null;

// Pagination state — render lists in batches and reveal more on user click
const FLIGHTS_PAGE_SIZE = 9;
let allFlights = [];
let renderedCount = 0;

const BOOKINGS_PAGE_SIZE = 9;
let allBookings = [];
let renderedBookingsCount = 0;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadFlightOptions();
});

async function loadFlightOptions() {
    try {
        const res = await fetch(`${API_BASE}/flights/options`);
        const data = await res.json();

        // Both dropdowns share the same unique city list (union of origins + destinations)
        const cities = [...new Set([...(data.origins || []), ...(data.destinations || [])])].sort();
        setupSearchableDropdown('origin', cities);
        setupSearchableDropdown('destination', cities);

        // Constrain the calendar to the date range available in seed data
        const dateInput = document.getElementById('departure-date');
        if (dateInput && data.dates && data.dates.length > 0) {
            const sorted = [...data.dates].sort();
            dateInput.min = sorted[0];
            dateInput.max = sorted[sorted.length - 1];
        }
    } catch (err) {
        console.error('Could not load flight filter options:', err);
    }
}

/**
 * Searchable autocomplete: shows all items on focus, filters as the user types,
 * supports keyboard navigation, and exposes a clear button.
 */
function setupSearchableDropdown(inputId, items) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const wrapper = input.closest('.search-select');
    const list = wrapper.querySelector('.search-select-list');
    const clearBtn = wrapper.querySelector('.search-select-clear');
    let activeIndex = -1;
    let visibleItems = [];

    function syncClearButtonVisibility() {
        wrapper.classList.toggle('has-value', input.value.length > 0);
    }

    function render(filter = '') {
        const f = filter.toLowerCase().trim();
        list.innerHTML = '';
        activeIndex = -1;
        visibleItems = items.filter(c => c.toLowerCase().includes(f));

        if (visibleItems.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-select-empty';
            empty.textContent = 'No matches';
            list.appendChild(empty);
            return;
        }

        visibleItems.forEach((city, idx) => {
            const opt = document.createElement('div');
            opt.className = 'search-select-option';
            opt.textContent = city;
            opt.dataset.index = idx;
            // mousedown fires before blur, so we can pick before the list hides
            opt.addEventListener('mousedown', e => {
                e.preventDefault();
                pick(city);
            });
            list.appendChild(opt);
        });
    }

    function pick(city) {
        input.value = city;
        list.classList.add('hidden');
        syncClearButtonVisibility();
        input.dispatchEvent(new Event('change'));
    }

    function setActive(idx) {
        const opts = list.querySelectorAll('.search-select-option');
        opts.forEach(o => o.classList.remove('active'));
        if (idx < 0 || idx >= opts.length) { activeIndex = -1; return; }
        activeIndex = idx;
        opts[idx].classList.add('active');
        opts[idx].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('focus', () => { render(input.value); list.classList.remove('hidden'); });
    input.addEventListener('input', () => {
        render(input.value);
        list.classList.remove('hidden');
        syncClearButtonVisibility();
    });
    input.addEventListener('blur', () => { setTimeout(() => list.classList.add('hidden'), 150); });
    input.addEventListener('keydown', e => {
        if (list.classList.contains('hidden')) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(activeIndex + 1, visibleItems.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(activeIndex - 1, 0)); }
        else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); pick(visibleItems[activeIndex]); }
        else if (e.key === 'Escape') { list.classList.add('hidden'); }
    });
    clearBtn.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = '';
        render('');
        syncClearButtonVisibility();
        input.focus();
    });
}

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
 * Display Flights — caches the full result and renders the first page.
 * The rest is revealed via the "Load More" button.
 */
function displayFlights(flights) {
    allFlights = flights;
    renderedCount = 0;
    document.getElementById('flights-list').innerHTML = '';
    document.getElementById('flights-count').textContent = `(${flights.length})`;
    appendFlightCards(FLIGHTS_PAGE_SIZE);
}

function appendFlightCards(count) {
    const container = document.getElementById('flights-list');
    const slice = allFlights.slice(renderedCount, renderedCount + count);
    slice.forEach(flight => container.appendChild(buildFlightCard(flight)));
    renderedCount += slice.length;
    updateLoadMoreButton();
}

function loadMoreFlights() {
    appendFlightCards(FLIGHTS_PAGE_SIZE);
}

function updateLoadMoreButton() {
    const btn = document.getElementById('load-more-btn');
    const remaining = allFlights.length - renderedCount;
    if (remaining > 0) {
        btn.textContent = `Load More (${remaining} remaining)`;
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

function buildFlightCard(flight) {
    const isFullyBooked = flight.available_seats === 0;
    const flightCard = document.createElement('div');
    flightCard.className = `flight-card${isFullyBooked ? ' flight-card-full' : ''}`;
    flightCard.dataset.flightId = flight.id;

    const departureTime = new Date(`2026-05-15T${flight.departure_time}`);
    const timeString = departureTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const durationHours = Math.floor(flight.duration_minutes / 60);
    const durationMins = flight.duration_minutes % 60;
    const durationString = durationHours > 0 ? `${durationHours}h ${durationMins}m` : `${durationMins}m`;

    flightCard.innerHTML = `
        <div class="flight-header">
            <div class="flight-header-top">
                <h3>${flight.origin} → ${flight.destination}</h3>
                ${isFullyBooked ? '<span class="flight-status-badge">Fully Booked</span>' : ''}
            </div>
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
                <span class="value seat-count ${flight.available_seats > 0 ? 'seats-available' : 'seats-full'}">${flight.available_seats}/${flight.total_seats}</span>
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

    return flightCard;
}

/**
 * Booking Modal
 */
async function openBookingModal(flight) {
    currentFlight = flight;
    currentSeatLimit = flight.total_seats;
    currentSelectedSeat = null;

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

    // Reset form state
    document.getElementById('booking-form').reset();
    document.getElementById('booking-error').classList.add('hidden');
    document.getElementById('booking-success').classList.add('hidden');
    document.getElementById('booking-form').classList.remove('hidden');
    document.getElementById('selected-seat-display').textContent = 'No seat selected';
    document.getElementById('seat-map-rows').innerHTML = '<div class="seat-map-loading">Loading seat map…</div>';

    modal.classList.remove('hidden');

    // Fetch booked seats then render the map
    try {
        const response = await fetch(`${API_BASE}/flights/${flight.id}/seats`);
        const seatsData = await response.json();
        renderSeatMap(seatsData.booked_seats, flight.total_seats);
    } catch (error) {
        document.getElementById('seat-map-rows').innerHTML = '<div class="seat-map-loading">Could not load seat map.</div>';
    }
}

function renderSeatMap(bookedSeats, totalSeats) {
    const container = document.getElementById('seat-map-rows');
    container.innerHTML = '';
    currentSelectedSeat = null;

    const seatsPerRow = 6;
    const totalRows = Math.ceil(totalSeats / seatsPerRow);

    for (let row = 0; row < totalRows; row++) {
        const rowEl = document.createElement('div');
        rowEl.className = 'seat-row';

        const rowLabel = document.createElement('span');
        rowLabel.className = 'row-num';
        rowLabel.textContent = row + 1;
        rowEl.appendChild(rowLabel);

        for (let col = 0; col < seatsPerRow; col++) {
            if (col === 3) {
                const aisle = document.createElement('span');
                aisle.className = 'seat-aisle-gap';
                rowEl.appendChild(aisle);
            }

            const seatNum = row * seatsPerRow + col + 1;
            const seatEl = document.createElement('div');

            if (seatNum <= totalSeats) {
                const isBooked = bookedSeats.includes(seatNum);
                seatEl.className = `seat ${isBooked ? 'seat-booked' : 'seat-available'}`;
                seatEl.textContent = seatNum;
                seatEl.dataset.seat = seatNum;
                if (!isBooked) {
                    seatEl.addEventListener('click', () => selectSeat(seatNum, seatEl));
                }
            } else {
                seatEl.className = 'seat seat-empty';
            }

            rowEl.appendChild(seatEl);
        }

        container.appendChild(rowEl);
    }
}

function selectSeat(seatNum, seatEl) {
    const prev = document.querySelector('.seat-selected');
    if (prev) {
        prev.classList.remove('seat-selected');
        prev.classList.add('seat-available');
    }
    currentSelectedSeat = seatNum;
    seatEl.classList.remove('seat-available');
    seatEl.classList.add('seat-selected');
    document.getElementById('selected-seat-display').textContent = `Selected: Seat ${seatNum}`;
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
    const seatNumber = currentSelectedSeat;

    if (!currentFlight) {
        showBookingError('Flight not selected');
        return;
    }

    if (!passengerName || !passportNumber) {
        showBookingError('Please fill in all fields');
        return;
    }

    if (!seatNumber) {
        showBookingError('Please select a seat from the seat map');
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

        // Show success and update the flight card's seat count in the background
        document.getElementById('booking-ref-display').textContent = `Your booking reference: ${data.booking_reference}`;
        document.getElementById('booking-form').classList.add('hidden');
        successDiv.classList.remove('hidden');
        updateFlightCardSeats(currentFlight.id);

    } catch (error) {
        showBookingError(error.message);
        // Refresh seat map so the user sees the true current state
        // (another user may have taken the seat between our check and their attempt)
        if (currentFlight) {
            try {
                const seatsRes = await fetch(`${API_BASE}/flights/${currentFlight.id}/seats`);
                const seatsData = await seatsRes.json();
                renderSeatMap(seatsData.booked_seats, currentFlight.total_seats);
            } catch (_) { /* silent — seat map stays as-is */ }
        }
    } finally {
        loading.classList.add('hidden');
    }
}

async function updateFlightCardSeats(flightId) {
    try {
        const res = await fetch(`${API_BASE}/flights/${flightId}/seats`);
        const data = await res.json();
        const totalSeats = data.available_seats + data.booked_seats.length;

        // Sync the cached flight so any subsequent re-render (e.g. Load More) is correct
        const cached = allFlights.find(f => f.id === flightId);
        if (cached) {
            cached.available_seats = data.available_seats;
            cached.total_seats = totalSeats;
        }

        // Re-render every visible card for this flight so the badge appears and
        // the Book Now button gets swapped for "No Seats Available" if needed.
        document.querySelectorAll(`[data-flight-id="${flightId}"]`).forEach(oldCard => {
            if (cached) oldCard.replaceWith(buildFlightCard(cached));
        });
    } catch (_) { /* non-critical */ }
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
    document.getElementById('bookings-count').textContent = '';

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
    document.getElementById('bookings-count').textContent = '';

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
 * Display Bookings — caches the full list (sorted most-recent-first) and renders
 * the first page. The rest is revealed via the "Load More" button.
 */
function displayBookings(data, type) {
    document.getElementById('bookings-list').innerHTML = '';
    bookingsCache = {};

    if (type === 'single') {
        // single booking by reference — no sorting/pagination needed
        allBookings = [data];
    } else {
        // newest first by booked_at
        allBookings = (data.bookings || []).slice().sort(
            (a, b) => new Date(b.booked_at) - new Date(a.booked_at)
        );
    }

    renderedBookingsCount = 0;
    document.getElementById('bookings-count').textContent =
        allBookings.length > 0 ? `(${allBookings.length})` : '';
    appendBookingCards(BOOKINGS_PAGE_SIZE);
}

function appendBookingCards(count) {
    const container = document.getElementById('bookings-list');
    const slice = allBookings.slice(renderedBookingsCount, renderedBookingsCount + count);
    slice.forEach(booking => {
        bookingsCache[booking.booking_reference] = booking;
        container.appendChild(buildBookingCard(booking));
    });
    renderedBookingsCount += slice.length;
    updateBookingsLoadMoreButton();
}

function loadMoreBookings() {
    appendBookingCards(BOOKINGS_PAGE_SIZE);
}

function updateBookingsLoadMoreButton() {
    const btn = document.getElementById('bookings-load-more-btn');
    const remaining = allBookings.length - renderedBookingsCount;
    if (remaining > 0) {
        btn.textContent = `Load More (${remaining} remaining)`;
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

function buildBookingCard(booking) {
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

    return card;
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
    // Backend returns naive UTC timestamps; tag with 'Z' so the browser parses
    // them as UTC instead of local time, then display in local time.
    document.getElementById('detail-booked-at').textContent = new Date(booking.booked_at + 'Z').toLocaleString();

    const cancelledRow = document.getElementById('detail-cancelled-row');
    if (booking.cancelled_at) {
        cancelledRow.classList.remove('hidden');
        document.getElementById('detail-cancelled-at').textContent = new Date(booking.cancelled_at + 'Z').toLocaleString();
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
 * Custom confirmation modal — drop-in replacement for window.confirm()
 * that styles to match the rest of the app and returns a Promise<boolean>.
 */
function showConfirm(title, message, options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const yesBtn = document.getElementById('confirm-yes');
        const noBtn = document.getElementById('confirm-no');

        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        yesBtn.textContent = options.confirmText || 'Confirm';
        noBtn.textContent = options.cancelText || 'Cancel';
        yesBtn.className = `btn ${options.confirmClass || 'btn-danger'}`;

        const cleanup = (result) => {
            modal.classList.add('hidden');
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKey);
            resolve(result);
        };
        const onYes = () => cleanup(true);
        const onNo = () => cleanup(false);
        const onBackdrop = (e) => { if (e.target === modal) cleanup(false); };
        const onKey = (e) => { if (e.key === 'Escape') cleanup(false); };

        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey);

        modal.classList.remove('hidden');
    });
}

/**
 * Toast — replaces alert() with a styled, auto-dismissing notification.
 * variant ∈ { 'success', 'error', 'info' (default) }.
 */
function showToast(message, variant = 'info', duration = 3500) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${variant}`;
    // Force reflow before adding visible class so the transition runs.
    void toast.offsetWidth;
    toast.classList.add('toast-visible');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.classList.remove('toast-visible');
    }, duration);
}

/**
 * Cancel Booking
 */
async function cancelBooking(bookingRef) {
    const confirmed = await showConfirm(
        'Cancel Booking?',
        'Are you sure you want to cancel this booking? This action cannot be undone.',
        { confirmText: 'Yes, Cancel Booking', cancelText: 'Keep Booking' }
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/bookings/${bookingRef}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Cancellation failed');
        }

        showToast(
            `Booking cancelled. Refund: Rs. ${parseFloat(data.refund_amount).toLocaleString()}`,
            'success'
        );
        getAllBookings();

    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
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
