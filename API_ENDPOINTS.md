# 🌐 API Endpoints - Personal Screener Backend

## 🚀 Start All Services

```bash
# Start all services (Auth + Screener + Gateway)
npm run dev

# Services will start on:
# - Gateway: http://localhost:3000
# - Auth Service: http://localhost:50051 (gRPC)
# - Screener Service: http://localhost:3003
```

---

## 📊 Screener Endpoints (via Gateway)

### 1. Wyckoff Quick Scan

**Get stocks in Wyckoff Phase C (Spring) or Phase D (SOS)**

```bash
# Basic scan (default: 1day, 70% confidence, 100 stocks)
curl "http://localhost:3000/api/screener/wyckoff"

# Custom parameters
curl "http://localhost:3000/api/screener/wyckoff?timeframe=1day&confidence=75&limit=50"

# Scan with 15min timeframe
curl "http://localhost:3000/api/screener/wyckoff?timeframe=15min&confidence=70&limit=20"

# Scan with 1hour timeframe
curl "http://localhost:3000/api/screener/wyckoff?timeframe=1hour&confidence=80&limit=30"
```

**Query Parameters:**
- `timeframe`: '15min' | '1hour' | '1day' (default: '1day')
- `confidence`: Minimum confidence % (default: 70)
- `limit`: Max stocks to scan (default: 100)

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-12-05T...",
    "totalScanned": 100,
    "matches": [
      {
        "symbol": "RELIANCE",
        "phase": "C",
        "confidence": 85,
        "supportLevel": 2450.00,
        "resistanceLevel": 2650.00,
        "lastPrice": 2485.50,
        "priceAction": "Spring at 2450.00",
        "volume": 1250000,
        "analysis": {
          "spring": true,
          "test": true,
          "volumeIncrease": true
        },
        "timestamp": "2024-12-05T...",
        "timeframe": "1day"
      }
    ],
    "phaseC": [...],
    "phaseD": [...],
    "duration": 45.23
  }
}
```

---

### 2. Custom Filter Scan

**Run screener with custom filter configurations**

```bash
curl -X POST "http://localhost:3000/api/screener/scan" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "wyckoff": {
        "minConfidence": 75,
        "timeframe": "1day",
        "lookbackDays": 90,
        "minRangePercent": 5,
        "maxRangePercent": 30
      }
    },
    "stockLimit": 200,
    "batchSize": 20
  }'
```

**Request Body:**
```json
{
  "filters": {
    "wyckoff": {
      "minConfidence": 70,      // 0-100
      "timeframe": "1day",      // '15min' | '1hour' | '1day'
      "lookbackDays": 90,        // 30-365
      "minRangePercent": 5,      // Min consolidation width %
      "maxRangePercent": 30      // Max consolidation width %
    }
  },
  "stockLimit": 100,           // Max stocks to scan
  "batchSize": 10               // Parallel processing size
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-12-05T...",
    "totalScanned": 200,
    "totalMatched": 15,
    "filters": {
      "wyckoff": [
        // Array of matched stocks
      ]
    },
    "duration": 67.45
  }
}
```

---

### 3. List Available Filters

**Get information about available screening filters**

```bash
curl "http://localhost:3000/api/screener/filters"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "available": [
      {
        "name": "wyckoff",
        "description": "Wyckoff accumulation Phase C (Spring) and Phase D (SOS)",
        "parameters": {
          "minConfidence": {
            "type": "number",
            "default": 70,
            "range": "0-100"
          },
          "timeframe": {
            "type": "enum",
            "default": "1day",
            "options": ["15min", "1hour", "1day"]
          },
          "lookbackDays": {
            "type": "number",
            "default": 90,
            "range": "30-365"
          }
        }
      }
    ]
  }
}
```

---

### 4. Check Screener Service Health

**Verify screener service is running**

```bash
curl "http://localhost:3000/api/screener/health"
```

**Response:**
```json
{
  "success": true,
  "screenerService": {
    "status": "ok",
    "service": "screener-service",
    "timestamp": "2024-12-05T..."
  }
}
```

---

## 🔐 Authentication Endpoints

### Register
```bash
curl -X POST "http://localhost:3000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123",
    "name": "John Doe"
  }'
```

### Login
```bash
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123"
  }'
```

---

## 🏥 Health Checks

### Gateway Health
```bash
curl "http://localhost:3000/health"
```

### Screener Service Health (Direct)
```bash
curl "http://localhost:3003/health"
```

### Gateway Root
```bash
curl "http://localhost:3000/"
```

### API Info
```bash
curl "http://localhost:3000/api"
```

---

## 📝 Example Workflows

### Workflow 1: Quick Wyckoff Scan

```bash
# 1. Check services are running
curl "http://localhost:3000/health"
curl "http://localhost:3000/api/screener/health"

# 2. Run Wyckoff scan
curl "http://localhost:3000/api/screener/wyckoff?limit=50" \
  | jq '.data.phaseC, .data.phaseD'

# 3. View results (Phase C and Phase D separately)
curl "http://localhost:3000/api/screener/wyckoff?limit=50" \
  | jq '.data.phaseC[] | {symbol, confidence, lastPrice}'
```

### Workflow 2: High-Confidence Scan

```bash
# Scan for high-confidence signals only
curl "http://localhost:3000/api/screener/wyckoff?confidence=85&limit=100" \
  | jq '.data.matches | length'
```

### Workflow 3: Multi-Timeframe Analysis

```bash
# Daily timeframe
curl "http://localhost:3000/api/screener/wyckoff?timeframe=1day&limit=20" \
  > daily_scan.json

# Hourly timeframe
curl "http://localhost:3000/api/screener/wyckoff?timeframe=1hour&limit=20" \
  > hourly_scan.json

# 15min timeframe
curl "http://localhost:3000/api/screener/wyckoff?timeframe=15min&limit=20" \
  > minute_scan.json

# Compare results
jq '.data.matches[].symbol' daily_scan.json hourly_scan.json minute_scan.json | sort | uniq -c
```

---

## 🔧 Environment Variables

```bash
# Gateway
PORT=3000
CORS_ORIGIN=http://localhost:3000

# Screener Service
SCREENER_PORT=3003
SCREENER_SERVICE_URL=http://localhost:3003

# Database
MONGODB_URI=mongodb://localhost:27017/screener
CLICKHOUSE_URL=https://your-instance.clickhouse.cloud:8443
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=your_password
```

---

## 🐛 Troubleshooting

### Service Not Available (503)
```bash
# Check if screener service is running
curl "http://localhost:3003/health"

# If not, start it:
cd services/screener-service && npm run dev
```

### Slow Response
```bash
# Reduce stock limit for faster results
curl "http://localhost:3000/api/screener/wyckoff?limit=10"
```

### No Results Found
```bash
# Lower confidence threshold
curl "http://localhost:3000/api/screener/wyckoff?confidence=60&limit=200"
```

---

## 📊 Response Interpretation

### Phase C (Spring)
- **Meaning**: Accumulation ending, prepare for markup
- **Action**: Consider buying
- **Risk**: Medium (still in consolidation)
- **Signals**: False breakdown + recovery + volume

### Phase D (SOS)
- **Meaning**: Markup phase starting
- **Action**: Buy or hold
- **Risk**: Lower (trend confirmed)
- **Signals**: Breakout + volume + backup

### Confidence Scores
- **85-100%**: Very strong signal, all criteria met
- **70-84%**: Good signal, most criteria met
- **<70%**: Filtered out (not returned)

---

**Happy Screening! 🚀**
