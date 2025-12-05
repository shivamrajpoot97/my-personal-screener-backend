# Resume ClickHouse Population

## 🎯 What Changed

The `clickhouse-populate.ts` script has been updated to support **smart resumption** - it will skip stocks that already have data and only fetch missing data.

## ✨ New Features

### 1. **Data Existence Check**
Before fetching data for each stock:
- ✅ Checks if candles already exist in ClickHouse
- ✅ Checks if features already exist
- ⏭️ Skips stocks that already have data
- 📊 Only fetches missing data

### 2. **Updated Timeframes**
```typescript
15min  →  1 month    (30 days)
1hour  →  4 months   (120 days)  
1day   →  2y 7m      (31 months = 943 days)
```

### 3. **Progress Tracking**
- Shows real-time progress for each batch
- Tracks: Processed, Fetched, Skipped, Failed
- Summary at the end of each timeframe

## 🚀 How to Resume Population

### Step 1: Check Current Status
```bash
cd scripts/upstox
npx ts-node check-clickhouse-data.ts
```

This will show you:
- Total candles per timeframe
- How many stocks are complete
- How many stocks are missing
- Date ranges
- Storage usage

### Step 2: Resume Population
```bash
cd scripts/upstox
UPSTOX_TOKEN=your_token npx ts-node clickhouse-populate.ts
```

The script will:
1. Connect to MongoDB (get stocks)
2. Connect to ClickHouse (check existing data)
3. **Skip stocks that already have data** ⏭️
4. Fetch only missing stocks 📥
5. Calculate features only if needed 🔧

## 📊 Example Output

```
=== 15min (last 30 days) ===
Date range: 2024-11-04 → 2024-12-04

Batch 1/6748 — 10 symbols

[1/67478] RELIANCE
⏭️  RELIANCE 15min: 2880 candles already exist, skipping

[2/67478] TCS  
📥 TCS 15min: need 30 days, API limit per call: 30 days
✅ TCS: saved 2880 15min candles (before features)
🔧 TCS: features calculated for 15min

Progress: 10/67478 | Fetched: 5 | Skipped: 4 | Failed: 1

✔️ Completed 15min:
   Total Processed: 67478
   Newly Fetched: 32000
   Skipped (Already Exists): 35400
   Failed: 78
```

## 🎯 Smart Features

### Automatic Skip Logic
```typescript
// For each stock:
1. Check if candles exist in date range
   ✅ Exists → Skip
   ❌ Missing → Fetch from Upstox

2. After saving candles:
   Check if features exist
   ✅ Exists → Skip calculation  
   ❌ Missing → Calculate & save
```

### API Limit Handling
```typescript
minutes/15 → Max 30 days per API call
minutes/60 → Max 90 days per API call
days/1     → Max 365 days per API call

// Script automatically chunks requests
```

## 📈 Progress Tracking

### Real-time Stats
- **Processed**: Total stocks checked
- **Fetched**: New data downloaded from Upstox
- **Skipped**: Already had data in ClickHouse
- **Failed**: Errors during processing

### Timeframe Summary
After each timeframe completes:
```
✔️ Completed 1hour:
   Total Processed: 67478
   Newly Fetched: 45120     ← New stocks fetched
   Skipped: 22300          ← Already had data
   Failed: 58              ← Errors (logged)
```

## 🔧 Configuration

### Adjust Batch Settings
```typescript
// In clickhouse-populate.ts
const batchSize = 10  // Stocks per batch

// Delays
await new Promise((r) => setTimeout(r, 300))   // Between stocks (300ms)
await new Promise((r) => setTimeout(r, 2000))  // Between batches (2s)
```

### Adjust Date Ranges
```typescript
const TIMEFRAMES = [
  { interval: 'minutes/15', mongoTimeframe: '15min', days: 30 },
  { interval: 'minutes/60', mongoTimeframe: '1hour', days: 120 },
  { interval: 'days/1',     mongoTimeframe: '1day',  days: 943 }
]
```

## 🐛 Troubleshooting

### Check What's Missing
```bash
cd scripts/upstox
npx ts-node check-clickhouse-data.ts
```

### Resume After Error
Just run the script again - it will automatically skip completed stocks:
```bash
UPSTOX_TOKEN=your_token npx ts-node clickhouse-populate.ts
```

### Monitor Progress
The script logs everything:
- ⏭️ Skipped stocks
- 📥 Fetched stocks  
- ✅ Saved candles
- 🔧 Features calculated
- ❌ Errors

## 💡 Tips

1. **Run check script first** to see current status
2. **Script is idempotent** - safe to run multiple times
3. **Ctrl+C safe** - resume anytime from where you left off
4. **Progress is saved** - each stock is saved immediately
5. **No duplicates** - ClickHouse ReplacingMergeTree handles updates

## 📝 What Gets Stored

### MongoDB (Reference Data)
```
✅ 67,478 stocks with instrument keys
✅ User data
✅ Authentication
```

### ClickHouse (Time Series)
```
📊 Candles: symbol, timestamp, OHLCV, derived fields
🔢 Features: SMA, RSI, VWAP, ATR, trend indicators
⚡ Optimized for fast analytics
```

## 🎉 Benefits

✅ **Resume Anywhere** - Stop and start without losing progress
✅ **No Duplicates** - Automatically skips existing data
✅ **API Efficient** - Only fetches what's missing
✅ **Fast** - ClickHouse handles millions of records
✅ **Reliable** - Each stock saved independently

---

**Ready to resume? Run the check script first to see your current status!**

```bash
cd scripts/upstox && npx ts-node check-clickhouse-data.ts
```