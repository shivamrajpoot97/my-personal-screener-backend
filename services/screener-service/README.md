# 🎯 Screener Service

**Advanced stock screening with multiple technical analysis filters**

## 🌟 Features

- ✅ **Wyckoff Analysis** - Detects Phase C (Spring) and Phase D (SOS)
- ✅ **Timeframe Synchronization** - Handles different candle timestamps
- ✅ **Automatic Conversion** - Converts 15min → 1hour → 1day as needed
- ✅ **Extensible Architecture** - Easy to add new filters
- ✅ **REST API** - HTTP endpoints for integration
- ✅ **CLI Mode** - Run from command line
- ✅ **Batch Processing** - Efficient parallel scanning

## 📊 Current Filters

### 1. Wyckoff Filter
**Detects accumulation patterns:**
- **Phase C (Spring)**: False breakdown below support + recovery
- **Phase D (SOS)**: Breakout above resistance with volume

**Configuration:**
- `minConfidence`: 0-100 (default: 70)
- `timeframe`: '15min' | '1hour' | '1day' (default: '1day')
- `lookbackDays`: 30-365 (default: 90)

## 🚀 Quick Start

### Install Dependencies
```bash
cd services/screener-service
npm install
```

### Run CLI Mode
```bash
# Wyckoff scan with default settings
npx tsx src/cli.ts

# Custom timeframe and limit
npx tsx src/cli.ts wyckoff 1day 50

# Scan 100 stocks on 1hour timeframe
npx tsx src/cli.ts wyckoff 1hour 100
```

### Start API Server
```bash
npm run dev
# Server starts on port 3002
```

## 🔌 API Endpoints

### 1. Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "service": "screener-service",
  "timestamp": "2024-12-05T..."
}
```

### 2. Quick Wyckoff Scan
```bash
GET /api/screener/wyckoff?timeframe=1day&confidence=70&limit=100
```

Response:
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-12-05T...",
    "totalScanned": 100,
    "matches": [...],
    "phaseC": [{
      "symbol": "RELIANCE",
      "phase": "C",
      "confidence": 85,
      "supportLevel": 2450.00,
      "lastPrice": 2485.50,
      "priceAction": "Spring at 2450.00"
    }],
    "phaseD": [...],
    "duration": 12.5
  }
}
```

### 3. Custom Filter Scan
```bash
POST /api/screener/scan
Content-Type: application/json

{
  "filters": {
    "wyckoff": {
      "minConfidence": 75,
      "timeframe": "1day",
      "lookbackDays": 90
    }
  },
  "stockLimit": 200,
  "batchSize": 20
}
```

### 4. List Available Filters
```bash
GET /api/screener/filters
```

## 🏗️ Architecture

```
ScreenerService (Main Orchestrator)
    |
    ├── WyckoffFilter (Phase C/D Detection)
    │       └── TimeframeConverter (Unifies candles)
    │
    ├── MomentumFilter (Future)
    ├── BreakoutFilter (Future)
    └── RSIFilter (Future)
```

## 🔧 How It Works

### 1. Timeframe Synchronization
**Problem**: Different candles have different latest timestamps:
- 15min: Latest is Dec 5, 2024 09:00
- 1hour: Latest is Dec 4, 2024 15:00  
- 1day: Latest is Dec 2, 2024

**Solution**: TimeframeConverter
- Tries to fetch data from target timeframe first
- If insufficient, converts from lower timeframes:
  - 15min → 1hour → 1day
- Aggregates OHLCV properly:
  - Open: First candle's open
  - High: Highest high
  - Low: Lowest low
  - Close: Last candle's close
  - Volume: Sum of all volumes

### 2. Wyckoff Detection Process

**Step 1: Get Unified Candles**
```typescript
const candles = await converter.getUnifiedCandles(symbol, '1day', 90);
```

**Step 2: Identify Trading Range**
- Looks at last 60 candles
- Finds support (lowest low) and resistance (highest high)
- Range must be 5-30% wide
- Calculates average volume

**Step 3: Detect Phase C (Spring)**
- Price breaks below support (< 98% of support)
- But closes above support
- Next candles recover (test)
- Volume increases (> 1.5x average)
- Confidence score based on criteria met

**Step 4: Detect Phase D (SOS)**
- Price breaks above resistance
- Volume increases (> 1.3x average)
- Pullback holds above support (backup)
- Confidence score based on criteria met

## 📝 Example Results

```
================================================================================
🎯 SCREENER RESULTS
================================================================================
Timestamp: 2024-12-05T12:00:00.000Z
Total Scanned: 100
Total Matched: 8
Duration: 45.23s

📊 Wyckoff Filter: 8 matches
--------------------------------------------------------------------------------

🔵 Phase C (Spring): 3 stocks
  • RELIANCE                  | Price: ₹ 2485.50 | Support: ₹ 2450.00 | Confidence: 85%
  • TCS                       | Price: ₹ 3245.75 | Support: ₹ 3200.00 | Confidence: 80%
  • INFY                      | Price: ₹ 1468.25 | Support: ₹ 1450.00 | Confidence: 75%

🟢 Phase D (SOS): 5 stocks
  • HDFC                      | Price: ₹ 1685.30 | Resistance: ₹ 1650.00 | Confidence: 90%
  • ICICI                     | Price: ₹  972.40 | Resistance: ₹  950.00 | Confidence: 85%
  • SBIN                      | Price: ₹  625.80 | Resistance: ₹  610.00 | Confidence: 82%
  • TATAMOTORS                | Price: ₹  896.50 | Resistance: ₹  875.00 | Confidence: 78%
  • BAJAJ-AUTO                | Price: ₹ 9245.20 | Resistance: ₹ 9100.00 | Confidence: 75%

================================================================================
```

## 🎨 Adding New Filters

### 1. Create Filter Class
```typescript
// src/services/MomentumFilter.ts
export interface MomentumResult {
  symbol: string;
  momentum: number;
  rsi: number;
  // ...
}

class MomentumFilter {
  async apply(symbol: string): Promise<MomentumResult | null> {
    // Your logic here
  }
}
```

### 2. Add to ScreenerService
```typescript
// src/services/ScreenerService.ts
if (this.config.filters.momentum) {
  const momentumResults = await this.runMomentumFilter(
    stocks, 
    this.config.filters.momentum
  );
  results.filters.momentum = momentumResults;
}
```

### 3. Add Route
```typescript
// src/routes/screenerRoutes.ts
router.get('/momentum', async (req, res) => {
  // Handle momentum filter
});
```

## 🧪 Testing

### Test with Small Dataset
```bash
# Test with 10 stocks
npx tsx src/cli.ts wyckoff 1day 10
```

### Test Different Timeframes
```bash
# 15min timeframe
npx tsx src/cli.ts wyckoff 15min 20

# 1hour timeframe  
npx tsx src/cli.ts wyckoff 1hour 30

# Daily timeframe
npx tsx src/cli.ts wyckoff 1day 50
```

### Test API Endpoints
```bash
# Start server
npm run dev

# In another terminal
curl http://localhost:3002/health
curl "http://localhost:3002/api/screener/wyckoff?limit=10"
```

## 📊 Performance

### Benchmarks (100 stocks)
- **15min timeframe**: ~20-30 seconds
- **1hour timeframe**: ~30-45 seconds
- **1day timeframe**: ~45-60 seconds

### Optimization Tips
1. **Reduce stock limit** for faster results
2. **Increase batch size** (10-20) for parallel processing
3. **Use 1day timeframe** - less data to process
4. **Cache results** for frequent queries

## 🔒 Environment Variables

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/screener

# ClickHouse  
CLICKHOUSE_URL=https://your-instance.clickhouse.cloud:8443
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=your_password

# Service
SCREENER_PORT=3002
```

## 📚 Future Filters

### Planned Filters
1. **Momentum Filter** - RSI, MACD divergence
2. **Breakout Filter** - Range breakouts with volume
3. **Moving Average Filter** - Golden/Death cross
4. **Volume Surge Filter** - Unusual volume spikes
5. **Support/Resistance Filter** - Key levels
6. **Cup & Handle Filter** - Classic pattern

## 🐛 Troubleshooting

### No Results Found
- Lower confidence threshold: `confidence=60`
- Increase stock limit: `limit=500`
- Try different timeframe: `timeframe=1hour`
- Check data availability in ClickHouse

### Slow Performance
- Reduce stock limit: `limit=50`
- Increase batch size in config
- Use daily timeframe (less data)
- Ensure ClickHouse indices are created

### Connection Errors
- Check MongoDB is running
- Verify ClickHouse credentials
- Ensure network connectivity
- Check environment variables

## 📖 Learn More

- [Wyckoff Method](https://www.wyckoffanalytics.com/)
- [ClickHouse for Time Series](https://clickhouse.com/docs/en/guides/sre/time-series)
- [Technical Analysis](https://www.investopedia.com/technical-analysis-4689657)

---

**Built with ❤️ for the Personal Screener Backend**