# 🎯 Wyckoff Analysis Scanner

A sophisticated stock screener that identifies Wyckoff Method patterns - specifically **Phase C (Spring)** and **Phase D (Sign of Strength)** in accumulation cycles.

## 📊 What is Wyckoff Analysis?

The Wyckoff Method is a technical analysis approach that focuses on supply and demand. The accumulation phase has 5 phases:

- **Phase A**: Stopping action (trend reversal)
- **Phase B**: Building cause (consolidation)
- **Phase C**: Spring/Test (final shakeout) ← **We detect this**
- **Phase D**: Sign of Strength (markup begins) ← **We detect this**  
- **Phase E**: Markup (uptrend)

## 🎯 What We Detect

### Phase C - Spring Pattern
**Characteristics:**
- ✅ Price breaks below support (false breakdown)
- ✅ Quickly recovers back above support
- ✅ Test after spring (confirmation)
- ✅ Volume increases on spring
- ✅ Price holds above support after recovery

**Trading Signal:** Accumulation ending, prepare for markup

### Phase D - Sign of Strength (SOS)
**Characteristics:**
- ✅ Price breaks above resistance
- ✅ Volume increases on breakout
- ✅ Backup to support (pullback test)
- ✅ Price holds above previous resistance
- ✅ Range breakout confirmed

**Trading Signal:** Markup phase beginning, strong uptrend likely

## 🚀 How to Use

### Basic Scan
```bash
cd scripts/screener
npx ts-node wyckoff-scanner.ts
```

### Configuration
Edit the scanner parameters in `wyckoff-scanner.ts`:

```typescript
// In main() function:
const scanner = new WyckoffScanner();
const results = await scanner.scan(
  '1day',  // Timeframe: '15min', '1hour', '1day'
  90       // Lookback days: 30, 60, 90, 180
);
```

### Adjust Stock Limit
```typescript
// In scan() method:
.limit(50)  // Change this number (1-2327)
```

### Confidence Threshold
```typescript
// In scan() method:
if (phase && phase.confidence >= 70)  // Minimum confidence %
```

## 📈 Output Format

```
🎯 WYCKOFF ANALYSIS RESULTS
================================================================================
Total stocks in Phase C/D: 8

📊 Phase C (Spring): 3 stocks
  RELIANCE: Spring at 2450.00 | Price: 2485.50 | Confidence: 85%
  TCS: Spring at 3200.00 | Price: 3245.75 | Confidence: 80%
  INFY: Spring at 1450.00 | Price: 1468.25 | Confidence: 75%

📈 Phase D (SOS): 5 stocks
  HDFC: SOS at 1650.00 | Price: 1685.30 | Confidence: 90%
  ICICI: SOS at 950.00 | Price: 972.40 | Confidence: 85%
  ...
```

## 🔍 Detection Logic

### Trading Range Identification
```typescript
// Looks at last 60 candles
// Range must be 5-30% wide
support = lowest low in range
resistance = highest high in range
avgVolume = average volume in range
```

### Phase C Detection
```typescript
1. Spring: low < support * 0.98 AND close > support
2. Test: next candle closes above support
3. Volume: spring volume > avgVolume * 1.5
4. Recovery: current price > support * 1.02

Confidence = 50 + bonuses:
  +20 if test confirmed
  +15 if high volume
  +15 if price recovered
```

### Phase D Detection
```typescript
1. SOS: close > resistance
2. Volume: breakout volume > avgVolume * 1.3
3. Backup: pullback holds above support * 1.02
4. Strength: current price > resistance * 1.05

Confidence = 60 + bonuses:
  +20 if high volume
  +10 if backup confirmed
  +10 if strong breakout
```

## 📊 Data Requirements

### Minimum Requirements
- ✅ At least 50 candles of historical data
- ✅ Clear trading range (5-30% width)
- ✅ Volume data available

### Best Results With
- 📊 Daily timeframe (less noise)
- 📅 90+ days lookback
- 🎯 70%+ confidence threshold
- 📈 Liquid stocks (high volume)

## 🎯 Confidence Scoring

### High Confidence (85-100%)
- All criteria met
- Strong volume confirmation
- Clear price action
- **Action:** Strong buy signal

### Medium Confidence (70-84%)
- Most criteria met
- Some volume confirmation
- Good price action
- **Action:** Consider buying

### Low Confidence (<70%)
- Few criteria met
- Weak confirmation
- **Action:** Skip (filtered out)

## 📝 Examples

### Phase C Example (Spring)
```
Symbol: RELIANCE
Support: 2450.00
Resistance: 2650.00

Day 1: Low 2430 (breaks support) → Spring!
Day 2: Close 2465 (recovers above support) → Test confirmed!
Volume: 2x average → Strong confirmation

Current Price: 2485
Confidence: 85%
Signal: Accumulation ending, prepare for markup
```

### Phase D Example (SOS)
```
Symbol: HDFC
Support: 1600.00
Resistance: 1650.00

Day 1: Close 1665 (breaks resistance) → SOS!
Volume: 1.5x average → Confirmed
Day 3: Low 1645 (holds above support) → Backup confirmed!

Current Price: 1685
Confidence: 90%
Signal: Markup phase started, strong uptrend
```

## ⚙️ Customization

### Adjust Range Width
```typescript
// In identifyTradingRange()
if (rangePercent < 5 || rangePercent > 30) {
  // Change 5 (tighter) or 30 (wider)
}
```

### Adjust Spring Threshold
```typescript
// In detectPhaseC()
if (candle.low < range.support * 0.98) {
  // Change 0.98 (2% below) to be more/less strict
}
```

### Adjust Volume Multiplier
```typescript
// In detectPhaseC() and detectPhaseD()
if (candle.volume > range.avgVolume * 1.5) {
  // Change 1.5x to be more/less strict
}
```

## 🚨 Important Notes

### False Signals
- Not all springs lead to markup
- Check overall market trend
- Verify with other indicators
- Risk management is crucial

### Best Practices
- ✅ Run scanner daily/weekly
- ✅ Track detected stocks over time
- ✅ Combine with fundamental analysis
- ✅ Use proper position sizing
- ✅ Set stop losses

### Limitations
- Requires clear trading range
- May miss patterns in trending markets
- Best in consolidation phases
- Volume data crucial

## 📈 Performance Tips

### Fast Scan (Testing)
```typescript
.limit(10)        // 10 stocks
lookbackDays: 30  // 30 days
```

### Thorough Scan (Production)
```typescript
.limit(2327)      // All stocks
lookbackDays: 90  // 90 days
```

### Very Thorough (Weekly)
```typescript
.limit(2327)       // All stocks
lookbackDays: 180  // 6 months
minConfidence: 80  // Higher threshold
```

## 🔗 Integration

### Save Results to Database
```typescript
// Add this in main():
const results = await scanner.scan('1day', 90);

// Save to MongoDB/ClickHouse
for (const result of results) {
  await WyckoffResult.create(result);
}
```

### API Endpoint
```typescript
// Express route
app.get('/api/screener/wyckoff', async (req, res) => {
  const scanner = new WyckoffScanner();
  const results = await scanner.scan();
  res.json(results);
});
```

### Scheduled Scans
```typescript
// Cron job - run daily at market close
cron.schedule('0 16 * * 1-5', async () => {
  const scanner = new WyckoffScanner();
  const results = await scanner.scan();
  await notifyResults(results);
});
```

## 🎓 Learning Resources

- **Wyckoff Method**: Study the original accumulation schematics
- **Volume Analysis**: Understanding volume's role in confirmation
- **Support/Resistance**: Identifying valid trading ranges
- **Risk Management**: Position sizing and stop losses

## 🛠️ Troubleshooting

### No Results Found
- Lower confidence threshold
- Increase lookback days
- Try different timeframe
- Check data availability

### Too Many Results
- Increase confidence threshold
- Reduce stock limit
- Tighten detection criteria
- Add volume filters

### Performance Issues
- Reduce stock limit
- Shorter lookback period
- Use caching for frequent scans
- Process in batches

---

**Built for the Personal Screener Backend - Wyckoff Module** 🎯