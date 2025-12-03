#!/bin/bash

# CandleFeatures Migration Helper Script
# This script helps run the CandleFeatures migration with proper environment setup

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found. Please create it with MONGODB_URI"
    exit 1
fi

# Check if MONGODB_URI is set
if ! grep -q "^MONGODB_URI=" .env; then
    print_error "MONGODB_URI not found in .env file"
    exit 1
fi

print_info "🚀 CandleFeatures Migration Helper"
echo "===================================="
echo ""

# Show menu
echo "Choose an option:"
echo "1. Run migration (convert old schema to new flexible schema)"
echo "2. Verify migration (check if migration was successful)"
echo "3. Run migration with custom batch size"
echo "4. Show help"
echo "5. Exit"
echo ""read -p "Enter your choice [1-5]: " choice

case $choice in
    1)
        print_info "Running migration with default settings..."
        print_warning "This will modify your CandleFeatures collection!"
        read -p "Are you sure you want to continue? (y/N): " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            print_info "Migration cancelled."
            exit 0
        fi
        
        print_info "Starting migration..."
        cd scripts
        npx ts-node migrate-candle-features.ts
        ;;
    
    2)
        print_info "Verifying migration status..."
        cd scripts
        npx ts-node migrate-candle-features.ts --verify
        ;;
    
    3)
        read -p "Enter batch size (default 1000): " batch_size
        if [ -z "$batch_size" ]; then
            batch_size=1000
        fi
        
        print_info "Running migration with batch size: $batch_size"
        print_warning "This will modify your CandleFeatures collection!"
        read -p "Are you sure you want to continue? (y/N): " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            print_info "Migration cancelled."
            exit 0
        fi
        
        print_info "Starting migration..."
        cd scripts
        npx ts-node migrate-candle-features.ts --batch-size $batch_size
        ;;
    
    4)
        echo ""
        print_info "CandleFeatures Migration Help"
        echo "============================="
        echo ""
        echo "This migration converts your CandleFeatures collection from:"
        echo "  OLD: { sma5: 123, sma10: 456, rsi14: 65, ... } (45+ fields)"
        echo "  NEW: { f: { 's5': 123, 's10': 456, 'r14': 65 } } (compact)"
        echo ""
        echo "Benefits:"
        echo "  • 64% storage reduction"
        echo "  • Better query performance"
        echo "  • More flexible schema"
        echo ""
        echo "The migration:"
        echo "  1. Converts old field names to compact keys"
        echo "  2. Only stores relevant features per timeframe"
        echo "  3. Maintains backward compatibility with helper methods"
        echo ""
        echo "Options:"
        echo "  --batch-size <number>  Process documents in batches (default: 1000)"
        echo "  --verify               Only check migration status"
        echo ""
        echo "Direct command:"
        echo "  npx ts-node scripts/migrate-candle-features.ts [options]"
        echo ""
        ;;
    
    5)
        print_info "Exiting..."
        exit 0
        ;;
    
    *)
        print_error "Invalid choice. Please enter 1-5."
        exit 1
        ;;
esac

echo ""
print_info "Migration helper completed!"
echo ""
print_info "Next steps:"
echo "1. Verify the migration was successful"
echo "2. Update your application code to use new helper methods:"
echo "   - candleFeature.getFeature('rsi14')"
echo "   - candleFeature.setFeature('sma20', value)"
echo "   - candleFeature.getAllFeatures()"
echo "3. Monitor storage usage and performance"
echo ""
print_info "For more details, see: services/upstox-service/STORAGE_ANALYSIS.md"