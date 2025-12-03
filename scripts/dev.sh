#!/bin/bash

# Development script - starts all services

echo "Starting Personal Screener Backend in development mode..."

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
cd services/auth && npm run dev &
AUTH_PID=$!

# Wait a bit for auth service to start
sleep 3

# Start gateway
echo "Starting Gateway..."
cd ../gateway && npm run dev &
GATEWAY_PID=$!

echo "All services started!"
echo "Auth Service PID: $AUTH_PID"
echo "Gateway PID: $GATEWAY_PID"
echo "Gateway running on: http://localhost:3000"
echo "Press Ctrl+C to stop all services"

# Wait for background processes
wait
