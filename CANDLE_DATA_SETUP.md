# Candle Data Setup & Population Guide

Complete guide to setting up and populating candle data for the Personal Screener Backend.

## 🎯 Overview

The system now includes two utility scripts to manage candle data:

1. **populate-candles.ts** - Fetch and populate missing candle data from Upstox
2. **check-candles.ts** - Verify candle data availability and quality

## 📋 Prerequisites

### Required Services
- ✅ MongoDB (running on port 27017)
- ✅ ClickHouse (configured in .env)
- ✅ Stock data populated in MongoDB

### Optional but Recommended
- ⚠️ Upstox Access Token (for fetching data)
- ⚠️ Redis (for caching)

## 🔑 Setup Upstox Access Token

### Method 1: Manual Token (Quick)

1. Login to https://api.upstox.com/
2. Go to your app dashboard
3. Generate an access token manually
4. Add to `.env`:

```env
UPSTOX_ACCESS_TOKEN=your_access_token_here
```

### Method 2: OAuth Flow (Production)

Implement the OAuth flow in your application to get tokens programmatically.

## 🚀 Quick Start

### Step 1: Check Current Data Status

```bash
# Check overall data availability
npm run check-candles

# Check specific symbol
npm run check-candles -- --symbol=RELIANCE
```

**Expected Output:**
```
📊 Overall Candle Data Overview
============================================================

15MIN:
  Unique Symbols: 0
  Total Candles:  0
  ...

1HOUR:
  Unique Symbols: 0
  Total Candles:  0
  ...

1DAY:
  Unique Symbols: 0
  Total Candles:  0
  ...
```

If all show 0, you need to populate data.

### Step 2: Populate Initial Data

#### Start Small (Test with few stocks)

```bash
# Test with 3 popular stocks for last 30 days
npm run populate-candles -- --symbols=RELIANCE,TCS,INFY --days=30 --timeframe=1day
```

#### Populate All Active Stocks

```bash
# Daily candles for last 90 days (recommended for initial setup)
npm run populate-candles -- --days=90 --timeframe=1day --batch=5

# This will process all active stocks in batches of 5
```

#### Add Intraday Data

```bash
# 1-hour candles for last 30 days
npm run populate-candles -- --days=30 --timeframe=1hour --batch=10

# 15-minute candles for last 7 days (lots of data!)
npm run populate-candles -- --days=7 --timeframe=15min --batch=5
```

### Step 3: Verify Data

```bash
# Check overall status again
npm run check-candles

# Check specific stocks
npm run check-candles -- --symbol=RELIANCE
npm run check-candles -- --symbol=TCS
```

**Expected Output After Population:**
```
📊 Checking candle data for: RELIANCE
============================================================

15MIN:
  Total Candles: 0
  First Candle:  N/A
  Last Candle:   N/A
  ⚠️  No 15min candles found!

1HOUR:
  Total Candles: 210
  First Candle:  2024-11-05 09:15:00
  Last Candle:   2024-12-05 15:30:00
  Avg Volume:    1234567
  ✅ Data is up to date

1DAY:
  Total Candles: 90
  First Candle:  2024-09-06 00:00:00
  Last Candle:   2024-12-05 00:00:00
  Avg Volume:    8901234
  ✅ Data is up to date
```

## 📅 Recommended Population Strategy

### For Development/Testing

```bash
# Step 1: Few stocks, short period
npm run populate-candles -- --symbols=RELIANCE,TCS,INFY --days=30 --timeframe=1day

# Step 2: Verify
npm run check-candles -- --symbol=RELIANCE

# Step 3: Add more if successful
npm run populate-candles -- --days=30 --timeframe=1day --batch=10
```

### For Production

```bash
# Phase 1: Daily candles (1 year)
npm run populate-candles -- --days=365 --timeframe=1day --batch=5

# Phase 2: Hourly candles (3 months)
npm run populate-candles -- --days=90 --timeframe=1hour --batch=5

# Phase 3: 15-min candles (1 month)
npm run populate-candles -- --days=30 --timeframe=15min --batch=3
```

## 🔄 Keeping Data Up-to-Date

### Manual Updates

```bash
# Update last 2 days of data (run daily)
npm run populate-candles -- --days=2 --timeframe=1day
npm run populate-candles -- --days=2 --timeframe=1hour
```

### Automated Updates (Cron)

Add to crontab:

```bash
# Daily update at 6 PM
0 18 * * * cd /path/to/project && npm run populate-candles -- --days=2 --timeframe=1day >> /var/log/candles.log 2>&1

# Hourly update (intraday)
0 16 * * 1-5 cd /path/to/project && npm run populate-candles -- --days=1 --timeframe=1hour >> /var/log/candles.log 2>&1
```

## 🐛 Troubleshooting

### Issue 1: "Timeout error" when querying candles

**Cause**: No data in ClickHouse

**Solution**:
```bash
# Check if data exists
npm run check-candles

# If shows 0 candles, populate:
npm run populate-candles -- --symbols=RELIANCE --days=30 --timeframe=1day
```

### Issue 2: "Stock not found or missing instrument key"

**Cause**: Stock not synced in MongoDB

**Solution**: First sync stock master data from Upstox or add manually to MongoDB

### Issue 3: "Upstox authentication failed"

**Cause**: Missing or invalid access token

**Solution**: 
1. Get new token from https://api.upstox.com/
2. Add to `.env`: `UPSTOX_ACCESS_TOKEN=new_token`
3. Restart the script

### Issue 4: "Rate limit exceeded"

**Cause**: Too many API calls

**Solution**:
```bash
# Reduce batch size and add delay
npm run populate-candles -- --batch=3 --days=30

# Or wait and try again later
```

### Issue 5: Script runs but no data inserted

**Diagnosis**:
```bash
# Check ClickHouse directly
clickhouse-client --query "SELECT count() FROM screener_db.candles"

# Check script output for errors
npm run populate-candles -- --symbols=RELIANCE --days=7
```

## 📊 Data Verification Queries

### ClickHouse Queries

```sql
-- Check total candles by timeframe
SELECT 
    timeframe,
    count() as total,
    count(DISTINCT symbol) as unique_symbols
FROM screener_db.candles
GROUP BY timeframe;

-- Check recent data for a symbol
SELECT *
FROM screener_db.candles
WHERE symbol = 'RELIANCE'
  AND timeframe = '1day'
ORDER BY timestamp DESC
LIMIT 10;

-- Find gaps in data
SELECT 
    symbol,
    timeframe,
    min(timestamp) as first_candle,
    max(timestamp) as last_candle,
    count() as total_candles,
    dateDiff('day', min(timestamp), max(timestamp)) as day_range
FROM screener_db.candles
GROUP BY symbol, timeframe
HAVING total_candles < day_range * 0.7
ORDER BY day_range DESC;
```

## 🎯 Best Practices

### 1. Start Small
- Test with 3-5 stocks first
- Use short date ranges (7-30 days)
- Verify before scaling up

### 2. Use Appropriate Timeframes
- **1day**: Historical analysis (1+ years)
- **1hour**: Swing trading (1-3 months)
- **15min**: Intraday trading (7-30 days)

### 3. Monitor Performance
- Watch for API rate limits
- Check ClickHouse disk usage
- Monitor script execution time

### 4. Regular Maintenance
- Daily updates for active trading
- Weekly full sync for verification
- Monthly cleanup of old 15min data

### 5. Error Handling
- Log all errors
- Retry failed stocks separately
- Keep track of last successful sync

## 📈 Data Volume Estimates

### Storage Requirements

| Timeframe | Period | Stocks | Approx Size |
|-----------|--------|--------|-------------|
| 15min | 7 days | 100 | ~20 MB |
| 15min | 30 days | 100 | ~80 MB |
| 1hour | 90 days | 100 | ~60 MB |
| 1day | 1 year | 100 | ~3 MB |
| 1day | 5 years | 1000 | ~150 MB |

### API Call Estimates

- 1 API call per stock per timeframe per population run
- Rate limit: ~10 calls per second (Upstox standard)
- 100 stocks = ~10 seconds with rate limiting

## 🔗 Related Documentation

- [Populate Candles README](./scripts/POPULATE_CANDLES_README.md)
- [Service Ports Configuration](./SERVICE_PORTS.md)
- [API Endpoints](./API_ENDPOINTS.md)

## 📞 Support

If you encounter issues:

1. ✅ Check this guide first
2. ✅ Run `npm run check-candles` to diagnose
3. ✅ Review script output for specific errors
4. ✅ Check Upstox API status
5. ✅ Verify ClickHouse connection

## 🎉 Success Checklist

Before running the screener:

- [ ] MongoDB connected and has stock data
- [ ] ClickHouse connected and schema initialized
- [ ] Upstox token configured (if needed)
- [ ] At least 30 days of daily candles populated
- [ ] Data verified with `check-candles` script
- [ ] No timeout errors in screener queries

---

**You're now ready to populate candle data and run the screener!** 🚀
