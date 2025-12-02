#!/bin/bash

# Setup script for Personal Screener Backend

echo "Setting up Personal Screener Backend..."

# Install root dependencies
echo "Installing root dependencies..."
npm install

# Install gateway dependencies
echo "Installing gateway dependencies..."
cd gateway && npm install && cd ..

# Install auth service dependencies
echo "Installing auth service dependencies..."
cd services/auth && npm install && cd ../..

# Create necessary directories
echo "Creating directories..."
mkdir -p logs
mkdir -p gateway/logs
mkdir -p services/auth/logs

# Set executable permissions
chmod +x scripts/setup.sh
chmod +x scripts/dev.sh
chmod +x scripts/build.sh

echo "Setup complete! "
echo "Next steps:"
echo "1. Update .env file with your MongoDB URI and other configurations"
echo "2. Run development: npm run dev"
echo "3. Or start services individually:"
echo "   - Auth service: npm run dev:auth"
echo "   - Gateway: npm run dev:gateway"
