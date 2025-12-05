# Candle Data Population Script

This script checks for missing candle data in ClickHouse and populates it from Upstox API.

## Prerequisites

1. **MongoDB** - Must be running (contains stock information)
2. **ClickHouse** - Must be running (target database for candles)
3. **Upstox Access Token** (optional, but required for fetching data)

## Setting Up Upstox Access Token

Add to your `.env` file:
```env
UPSTOX_ACCESS_TOKEN=your_access_token_here
```

### How to get Upstox Access Token:

1. Login to Upstox Developer Console: https://api.upstox.com/
2. Create an app and get your API Key and Secret
3. Use OAuth flow to get access token
4. Or manually generate token from the Upstox dashboard

## Usage

### Basic Usage (Default: 30 days, 1day timeframe)

```bash
npm run populate-candles
```

### Custom Days

```bash
npm run populate-candles -- --days=90
```

### Different Timeframes

```bash
# 15-minute candles
npm run populate-candles -- --timeframe=15min --days=7

# 1-hour candles
npm run populate-candles -- --timeframe=1hour --days=30

# Daily candles
npm run populate-candles -- --timeframe=1day --days=365
```

### Specific Symbols

```bash
npm run populate-candles -- --symbols=RELIANCE,TCS,INFY --days=30
```

### Batch Size Control

```bash
# Process 5 stocks at a time (default is 10)
npm run populate-candles -- --batch=5
```

### Combined Options

```bash
npm run populate-candles -- --days=90 --timeframe=1day --symbols=RELIANCE,TCS --batch=5
```

## What the Script Does

1. **Connects to Databases**
   - MongoDB (for stock information)
   - ClickHouse (for candle storage)

2. **Checks Missing Data**
   - Queries ClickHouse for existing candles
   - Calculates how many candles should exist
   - Identifies gaps in data

3. **Fetches from Upstox**
   - Uses Upstox Historical Data API
   - Fetches missing candles for each stock
   - Respects rate limits (250ms delay between requests)

4. **Populates ClickHouse**
   - Transforms Upstox data format
   - Calculates derived metrics (price change, body size, etc.)
   - Bulk inserts into ClickHouse

## Output Example

```bash
🚀 Starting Candle Data Population
Options: {
  "days": 30,
  "timeframe": "1day",
  "skipExisting": true,
  "batchSize": 10
}
✅ Connected to MongoDB
✅ Connected to ClickHouse
Found 100 stocks to process
Date range: 2024-11-05T00:00:00.000Z to 2024-12-05T00:00:00.000Z

Checking 100 stocks for missing 1day candles...
RELIANCE: 5 missing candles (25/30)
TCS: 0 missing candles (30/30)
INFY: 10 missing candles (20/30)

📊 Summary: 45 stocks need data population

Processing batch 1/5
Fetching 1day candles for RELIANCE...
✅ Inserted 5 1day candles for RELIANCE
Fetching 1day candles for INFY...
✅ Inserted 10 1day candles for INFY
...

✅ Population complete! Inserted 350 total candles
Connections closed
```

## Expected Candles Calculation

### 15-minute candles
- Trading hours: 9:15 AM - 3:30 PM (6.25 hours)
- Candles per day: ~25-26
- For 7 days: ~175-180 candles (excluding weekends)

### 1-hour candles
- Candles per day: ~6-7
- For 30 days: ~150 candles (excluding weekends/holidays)

### Daily candles
- Candles per day: 1
- For 30 days: ~21 candles (only trading days)

## Rate Limiting

The script includes:
- 250ms delay between API calls
- Batch processing (default 10 stocks at a time)
- Error handling and retry logic

## Error Handling

The script handles:
- Missing stock information
- Upstox API failures
- Network timeouts
- Authentication errors
- Database connection issues

## Troubleshooting

### "Stock not found or missing instrument key"

**Solution**: Ensure stocks are properly synced in MongoDB with instrument keys.

```bash
# Check stock data
db.stocks.findOne({ symbol: "RELIANCE" })
```

### "Upstox authentication failed"

**Solution**: Set valid `UPSTOX_ACCESS_TOKEN` in `.env` file.

### "ClickHouse connection failed"

**Solution**: Check ClickHouse credentials in `.env`:

```env
CLICKHOUSE_URL=https://your-instance.clickhouse.cloud:8443
CLICKHOUSE_USERNAME=default
CLICKHOUSE_PASSWORD=your_password
```

### "Timeout errors"

**Solution**: 
- Reduce batch size: `--batch=5`
- Check network connectivity
- Verify ClickHouse/Upstox services are accessible

## Best Practices

1. **Start Small**: Test with a few symbols first
   ```bash
   npm run populate-candles -- --symbols=RELIANCE,TCS --days=7
   ```

2. **Use Appropriate Timeframes**:
   - For recent data: Use 15min or 1hour
   - For historical analysis: Use 1day
   - Don't fetch 15min data for 365 days (too much data)

3. **Run During Off-Hours**: To avoid rate limits during market hours

4. **Monitor Progress**: Watch for any repeated errors for specific stocks

5. **Incremental Updates**: Run daily with `--days=2` to keep data fresh

## Scheduling (Optional)

Add to crontab for daily updates:

```bash
# Run every day at 6 PM to update last 2 days
0 18 * * * cd /path/to/project && npm run populate-candles -- --days=2 >> /var/log/populate-candles.log 2>&1
```

## Data Validation

After running, verify data in ClickHouse:

```sql
-- Check total candles
SELECT 
    symbol,
    timeframe,
    count() as candle_count,
    min(timestamp) as first_candle,
    max(timestamp) as last_candle
FROM screener_db.candles
WHERE symbol = 'RELIANCE'
GROUP BY symbol, timeframe;

-- Check recent candles
SELECT *
FROM screener_db.candles
WHERE symbol = 'RELIANCE'
  AND timeframe = '1day'
ORDER BY timestamp DESC
LIMIT 10;
```

## Performance

- **Speed**: ~10-20 stocks per minute (with rate limiting)
- **API Calls**: 1 per stock per timeframe
- **Database**: Bulk inserts for efficiency
- **Memory**: Processes in batches to avoid memory issues

## Support

For issues or questions:
1. Check logs in the console output
2. Verify all prerequisites are met
3. Test with a single stock first
4. Check Upstox API status: https://api.upstox.com/status
