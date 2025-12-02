#!/bin/bash

# Build script for production

echo "Building Personal Screener Backend..."

# Build auth service
echo "Building Auth Service..."
cd services/auth && npm run build
if [ $? -ne 0 ]; then
    echo "Auth service build failed!"
    exit 1
fi
cd ../..

# Build gateway
echo "Building Gateway..."
cd gateway && npm run build
if [ $? -ne 0 ]; then
    echo "Gateway build failed!"
    exit 1
fi
cd ..

echo "Build completed successfully!"
echo "Production files are in:"
echo "  - services/auth/dist/"
echo "  - gateway/dist/"
