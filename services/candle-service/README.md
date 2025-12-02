# Candle Service

A high-performance, scalable service for storing, managing, and serving financial candle data with automatic hierarchical data retention and technical indicators.

## Features

### Core Functionality
- **Optimized Storage**: Separate collections for OHLCV data and technical indicators
- **Hierarchical Retention**: Automatic conversion from 15min → 1hour → 1day timeframes
- **Technical Indicators**: Full suite of technical analysis indicators stored separately
- **Backup System**: Compressed backup of converted data with 2-year retention
- **Multi-timeframe Support**: Seamless querying across different timeframes

### Data Retention Policy
- **15min candles**: Stored for 30 days, then converted to 1hour
- **1hour candles**: Stored for 6 months, then converted to 1day
- **1day candles**: Stored permanently
- **Backups**: Compressed historical data retained for 2 years

### Technical Features
- **Automatic Conversion**: Daily cron jobs handle timeframe conversions
- **Batch Operations**: Efficient bulk insert and update operations
- **Real-time APIs**: Live data access for trading strategies
- **Backtest Support**: Historical data querying with date ranges
- **Multi-timeframe Analysis**: Context from multiple timeframes

## Architecture

### Collections

#### 1. Candles Collection
Stores core OHLCV data with basic derived metrics:
```typescript
{
  symbol: string;
  timeframe: '15min' | '1hour' | '1day';
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest?: number;
  priceChange: number;
  priceChangePercent: number;
  range: number;
  bodySize: number;
  upperShadow: number;
  lowerShadow: number;
}
```

#### 2. CandleFeatures Collection
Stores technical indicators and derived metrics:
```typescript
{
  candleId: ObjectId; // Reference to candle
  symbol: string;
  timeframe: string;
  timestamp: Date;
  // Technical indicators (SMA, EMA, RSI, MACD, etc.)
  // Support/Resistance levels
  // Market structure indicators
}
```

#### 3. CandleBackup Collection
Stores compressed historical data:
```typescript
{
  symbol: string;
  originalTimeframe: string;
  targetTimeframe: string;
  date: Date;
  candlesData: Array<OHLCV>;
  featuresData?: Array<Indicators>;
  compressionRatio: number;
}
```

### Services

#### CandleService
- Core CRUD operations for candle data
- Batch insert/update operations
- Query with filtering and pagination
- Relationship management between candles and features

#### CandleConverterService
- Timeframe conversion logic (15min→1hour, 1hour→1day)
- Data aggregation and feature consolidation
- Backup creation before conversion

#### CronService
- Automated daily conversion jobs
- Manual conversion triggers
- Job monitoring and control

#### CandleDataService
- High-level API for trading strategies
- Multi-timeframe data access
- Real-time and historical data formatting
- Backtest data preparation

## API Endpoints

### Core Data Operations

#### Store Single Candle
```http
POST /api/candles
Content-Type: application/json

{
  "candleData": {
    "symbol": "AAPL",
    "timeframe": "15min",
    "timestamp": "2023-12-01T10:15:00Z",
    "open": 185.50,
    "high": 186.20,
    "low": 185.30,
    "close": 186.00,
    "volume": 1500000
  },
  "featuresData": {
    "rsi": 65.5,
    "macd": 1.2,
    "sma20": 184.80
  }
}
```

#### Store Batch Candles
```http
POST /api/candles/batch
Content-Type: application/json

{
  "candlesData": [...],
  "featuresData": [...]
}
```

#### Query Candles
```http
GET /api/candles?symbol=AAPL&timeframe=1hour&limit=100&includeFeatures=true
GET /api/candles?symbol=AAPL&from=2023-12-01&to=2023-12-31
```

#### Get Latest Candle
```http
GET /api/candles/latest/AAPL/15min
```

### Conversion Operations

#### Manual Conversion Trigger
```http
POST /api/candles/convert
Content-Type: application/json

{
  "fromTimeframe": "15min",
  "toTimeframe": "1hour",
  "symbol": "AAPL",
  "date": "2023-12-01"
}
```

### Monitoring

#### Cron Jobs Status
```http
GET /api/candles/cron/status
```

#### Control Cron Jobs
```http
POST /api/candles/cron/start/15min-to-1hour
POST /api/candles/cron/stop/1hour-to-1day
```

### Data Availability

#### Available Symbols and Timeframes
```http
GET /api/candles/available
```

### Upstox Integration

#### Parse Upstox Candle Data
```http
POST /api/candles/parse-upstox
Content-Type: application/json

{
  "symbol": "NSE_EQ|INE002A01018",
  "timeframe": "15min",
  "candleArray": [1701426900000, 185.50, 186.20, 185.30, 186.00, 1500000, 0]
}
```

## Usage Examples

### For Trading Strategies

```typescript
import CandleDataService from './services/CandleDataService';

// Get data for strategy
const strategyData = await CandleDataService.getStrategyData({
  symbol: 'AAPL',
  timeframe: '1hour',
  periods: 50,
  requiredIndicators: ['rsi', 'macd', 'sma20']
});

// Multi-timeframe analysis
const multiData = await CandleDataService.getMultiTimeframeData(
  'AAPL',
  '1hour', // Primary timeframe
  50,      // Periods
  true,    // Include higher timeframe (1day)
  false    // Include lower timeframe (15min)
);

// Real-time data
const liveData = await CandleDataService.getRealtimeData('AAPL', '15min');

// Backtest data
const backtestData = await CandleDataService.getBacktestData(
  'AAPL',
  '1hour',
  new Date('2023-01-01'),
  new Date('2023-12-31')
);
```

### Data Structure for Strategies

```typescript
interface StrategyCandle {
  ohlcv: {
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  indicators: {
    sma: { sma5?: number; sma20?: number; /* ... */ };
    ema: { ema9?: number; ema21?: number; /* ... */ };
    momentum: { rsi?: number; stochK?: number; /* ... */ };
    trend: { macd?: number; adx?: number; /* ... */ };
    volatility: { atr?: number; bbUpper?: number; /* ... */ };
    volume: { vwap?: number; volumeRatio?: number; /* ... */ };
    levels: { support1?: number; resistance1?: number; /* ... */ };
    structure: { higherHigh?: boolean; pricePosition?: number; /* ... */ };
  };
  derived: {
    priceChange: number;
    priceChangePercent: number;
    candleType: 'bullish' | 'bearish' | 'doji';
    candlePattern?: string;
  };
}
```

## Configuration

### Environment Variables

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/screener

# Service
CANDLE_SERVICE_PORT=3002
NODE_ENV=development

# Logging
LOG_LEVEL=info
```

### Cron Schedule

- **15min → 1hour conversion**: Daily at 1:00 AM UTC
- **1hour → 1day conversion**: Daily at 2:00 AM UTC
- **Backup cleanup**: Weekly on Sunday at 3:00 AM UTC

## Performance Considerations

### Database Indexes

```javascript
// Primary indexes for efficient querying
{ symbol: 1, timeframe: 1, timestamp: -1 } // Unique
{ symbol: 1, timestamp: -1 }
{ timeframe: 1, timestamp: -1 }
{ timestamp: -1 }

// Technical indicator indexes
{ symbol: 1, rsi: 1 }
{ symbol: 1, macd: 1 }
{ trendDirection: 1, symbol: 1 }

// TTL indexes for automatic cleanup
{ timestamp: 1, expireAfterSeconds: 2592000 } // 30 days for 15min
{ timestamp: 1, expireAfterSeconds: 15552000 } // 6 months for 1hour
```

### Memory Usage

- Batch operations use MongoDB sessions for consistency
- Large queries are paginated automatically
- Conversion processes include delays to prevent database overload

### Storage Optimization

- Basic candle data: ~50 bytes per candle
- Technical indicators: ~200 bytes per feature set
- Backup compression ratio: Typically 80-90% size reduction

## Development

### Setup

```bash
# Install dependencies
npm install

# Build
npm run build

# Development
npm run dev

# Production
npm start
```

### Testing

```bash
# Run tests
npm test

# Test conversion manually
curl -X POST http://localhost:3002/api/candles/convert \
  -H "Content-Type: application/json" \
  -d '{
    "fromTimeframe": "15min",
    "toTimeframe": "1hour",
    "symbol": "AAPL",
    "date": "2023-12-01"
  }'
```

## Monitoring

### Health Check
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2023-12-01T10:00:00Z",
  "service": "candle-service",
  "database": true
}
```

### Logs

Service uses structured logging with different levels:
- **ERROR**: Critical issues requiring attention
- **WARN**: Important but non-critical issues
- **INFO**: General operational information
- **DEBUG**: Detailed debugging information

## Future Enhancements

1. **Real-time Streaming**: WebSocket support for live data
2. **Advanced Analytics**: Additional technical indicators
3. **Performance Metrics**: Query performance monitoring
4. **Data Validation**: Enhanced input validation and sanitization
5. **Compression**: Advanced compression for historical data
6. **Sharding**: Database sharding for horizontal scaling
