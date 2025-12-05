# Screener Caching System

## Quick Start with Caching

### 1. Start Screener with Cache Enabled

bash
cd services/screener-service
npm run dev:cached


### 2. Test Cached Query

bash
# First request (cache miss - takes time)
curl http://localhost:3003/api/screener/wyckoff?timeframe=1day&confidence=70

# Second request (cache hit - instant!)
curl http://localhost:3003/api/screener/wyckoff?timeframe=1day&confidence=70


### 3. Force Fresh Scan

bash
curl http://localhost:3003/api/screener/wyckoff?timeframe=1day&confidence=70&useCache=false


### 4. Manually Trigger Pre-computation

bash
curl -X POST http://localhost:3003/api/screener/cache/precompute


### 5. Check Cache Stats

bash
curl http://localhost:3003/api/screener/cache/stats


## Benefits

- No more timeouts
- Instant results (< 100ms instead of minutes)
- Daily fresh data
- Predictable performance

