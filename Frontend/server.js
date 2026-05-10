const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_URL || 'http://localhost:8000/api';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes

/**
 * Home page - Flight search
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Proxy API calls to backend
 */

// GET /api/flights - with optional query params
app.get('/api/flights', async (req, res) => {
    try {
        const query = new URLSearchParams(req.query).toString();
        const url = query ? `${API_BASE_URL}/flights?${query}` : `${API_BASE_URL}/flights`;
        const response = await fetch(url);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error fetching flights:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/flights/search - with required query params
app.get('/api/flights/search', async (req, res) => {
    try {
        const query = new URLSearchParams(req.query).toString();
        const response = await fetch(`${API_BASE_URL}/flights/search?${query}`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error searching flights:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/flights/options
app.get('/api/flights/options', async (req, res) => {
    try {
        const response = await fetch(`${API_BASE_URL}/flights/options`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error fetching flight options:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/flights/:id/seats
app.get('/api/flights/:id/seats', async (req, res) => {
    try {
        const response = await fetch(`${API_BASE_URL}/flights/${req.params.id}/seats`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error fetching flight seats:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/flights/:id
app.get('/api/flights/:id', async (req, res) => {
    try {
        const response = await fetch(`${API_BASE_URL}/flights/${req.params.id}`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error fetching flight:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/bookings - Create booking
app.post('/api/bookings', async (req, res) => {
    try {
        const response = await fetch(`${API_BASE_URL}/bookings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/bookings - Get all bookings
app.get('/api/bookings', async (req, res) => {
    try {
        const response = await fetch(`${API_BASE_URL}/bookings`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error fetching all bookings:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/bookings/:booking_reference
app.get('/api/bookings/:bookingRef', async (req, res) => {
    try {
        const response = await fetch(`${API_BASE_URL}/bookings/${req.params.bookingRef}`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error fetching booking:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/bookings/passenger/:passenger_name
app.get('/api/bookings/passenger/:passengerName', async (req, res) => {
    try {
        const response = await fetch(`${API_BASE_URL}/bookings/passenger/${encodeURIComponent(req.params.passengerName)}`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error fetching passenger bookings:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/bookings/:booking_reference
app.delete('/api/bookings/:bookingRef', async (req, res) => {
    try {
        const response = await fetch(`${API_BASE_URL}/bookings/${req.params.bookingRef}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error cancelling booking:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Frontend server is running' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`\n✅ FlightHub Frontend running on http://localhost:${PORT}`);
    console.log(`📡 Backend API: ${API_BASE_URL}\n`);
});
