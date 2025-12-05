# Service Port Configuration

## All Services and Their Ports

| Service | Port | Protocol | Status |
|---------|------|----------|--------|
| **Auth Service** | 50051 | gRPC | ✅ Running |
| **Gateway** | 3000 | HTTP | ✅ Ready to start |
| **Proxy Server** | 3001 | HTTP | ⚠️ External (Firewall) |
| **Candle Service** | 3005 | HTTP | ✅ Running |
| **Screener Service** | 3003 | HTTP | ✅ Running |
| **Upstox Service** | 3004 | HTTP | ✅ Running |

## Port 3001 - Reserved
Port 3001 is reserved for your proxy server used for firewall security and should not be used by any backend services.

## Environment Variables Required

Add these to your `.env` file:

```env
# Service Ports
GATEWAY_PORT=3002
AUTH_SERVICE_PORT=50051
CANDLE_SERVICE_PORT=3005
SCREENER_SERVICE_PORT=3003
UPSTOX_SERVICE_PORT=3004

# Service URLs
AUTH_SERVICE_URL=localhost:50051
CANDLE_SERVICE_URL=http://localhost:3005
SCREENER_SERVICE_URL=http://localhost:3003
UPSTOX_SERVICE_URL=http://localhost:3004
```

## API Endpoints

### Gateway (Port 3000)
- `GET /health` - Health check
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/screener/wyckoff` - Wyckoff scan (proxied to Screener Service)
- `POST /api/screener/scan` - Custom scan (proxied to Screener Service)

### Screener Service (Port 3003)
- `GET /health` - Health check
- `POST /api/screener/scan` - Custom stock screening
- `GET /api/screener/wyckoff` - Wyckoff phase analysis

### Candle Service (Port 3005)
- `GET /health` - Health check
- `POST /api/candles` - Store candle data
- `GET /api/candles` - Query candle data
- `POST /api/candles/convert` - Manual timeframe conversion

### Upstox Service (Port 3004)
- `GET /health` - Health check
- `GET /api/upstox/*` - Upstox data endpoints

### Auth Service (Port 50051)
- gRPC service for authentication
- Used internally by Gateway

## Starting All Services

```bash
npm run dev
```

This will start all services in the correct order with proper port assignments.

## Health Check Commands

```bash
# Check all services
curl http://localhost:3000/health  # Gateway
curl http://localhost:3003/health  # Screener
curl http://localhost:3004/health  # Upstox
curl http://localhost:3005/health  # Candle
```

## Wyckoff Phase Queries

### Phase C (Test)
```bash
curl -X POST http://localhost:3003/api/screener/scan \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "wyckoffPhase": "Phase C (Test)"
    },
    "timeframe": "1day",
    "limit": 50
  }'
```

### Phase D (Markup)
```bash
curl -X POST http://localhost:3003/api/screener/scan \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "wyckoffPhase": "Phase D (Markup)"
    },
    "timeframe": "1day",
    "limit": 50
  }'
```

## Changes Made

1. ✅ Fixed duplicate `export default` in `ClickHouseCandleFeatures.ts`
2. ✅ Updated `dev.sh` script with absolute paths and all services
3. ✅ Changed Candle Service port from 3001 to 3005 (avoiding proxy server)
4. ✅ Fixed Screener Service port from 3002 to 3003
5. ✅ Changed Upstox Service from ts-node to tsx for better module resolution
6. ✅ Changed Candle Service from ts-node-dev to tsx
7. ✅ Installed missing dependencies (compression, tsx)
8. ✅ Fixed syntax error in CronService.ts (removed stray `</contents>` tag)
9. ✅ Updated shared config with correct port assignments
</contents>