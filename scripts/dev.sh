#!/bin/bash

# Development script - starts all services

echo "Starting Personal Screener Backend in development mode..."

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Function to cleanup background processes
cleanup() {
    echo "Stopping all services..."
    jobs -p | xargs -r kill
    exit 0
}

# Trap Ctrl+C
trap cleanup INT

# Start auth service in background
echo "Starting Auth Service..."
cd "$ROOT_DIR/services/auth" && npm run dev &
AUTH_PID=$!

# Wait a bit for auth service to start
sleep 2

# Start candle service
echo "Starting Candle Service..."
cd "$ROOT_DIR/services/candle-service" && npm run dev &
CANDLE_PID=$!

# Wait a bit for candle service to start
sleep 2

# Start upstox service
echo "Starting Upstox Service..."
cd "$ROOT_DIR/services/upstox-service" && npm run dev &
UPSTOX_PID=$!

# Wait a bit for upstox service to start
sleep 2

# Start screener service
echo "Starting Screener Service..."
cd "$ROOT_DIR/services/screener-service" && npm run dev &
SCREENER_PID=$!

# Wait a bit for screener service to start
sleep 2

# Start gateway
echo "Starting Gateway..."
cd "$ROOT_DIR/gateway" && npm run dev &
GATEWAY_PID=$!

echo ""
echo "=========================================="
echo "All services started!"
echo "=========================================="
echo "Auth Service PID: $AUTH_PID (gRPC :50051)"
echo "Candle Service PID: $CANDLE_PID (HTTP :3005)"
echo "Upstox Service PID: $UPSTOX_PID (HTTP :3004)"
echo "Screener Service PID: $SCREENER_PID (HTTP :3002)"
echo "Gateway PID: $GATEWAY_PID (HTTP :3003)"
echo ""
echo "Available endpoints:"
echo "  - Gateway: http://localhost:3000"
echo "  - Screener Service: http://localhost:3003"
echo "  - Upstox Service: http://localhost:3004"
echo "  - Candle Service: http://localhost:3005"
echo ""
echo "Note: Port 3001 is reserved for proxy server"
echo "Press Ctrl+C to stop all services"
echo "=========================================="

# Wait for background processes
wait

