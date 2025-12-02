MongoDB Storage Analysis – Flexible Schema Optimization Applied

1. Flexible Feature Schema
   - Replace 45+ individual fields with single “f” object using short keys.
   - Typical CandleFeatures size drops from ~400 bytes to 80–200 bytes depending on timeframe.
   - Expected storage reduction: ~64% for features, ~46% total.

2. Document Size Breakdown (3,000 stocks)
   • Candle (all timeframes): 160 bytes
   • Features (“f” object):
     – 15 min: ~120 bytes (7 features)
     – 1 hour: ~140 bytes (9 features)
     – Daily: ~200 bytes (10 features)

3. Data Volume & Storage

   3.1 15-minute (60 days)
   – 4,500,000 documents
     • Candle: 4.5 M × 160 B = 720 MB
     • Features: 4.5 M × 120 B = 540 MB
     → Subtotal: 1,260 MB

   3.2 1-hour (180 days)
   – 3,780,000 documents
     • Candle: 3.78 M × 160 B = 605 MB
     • Features: 3.78 M × 140 B = 529 MB
     → Subtotal: 1,134 MB

   3.3 Daily (3 years ≈ 750 days)
   – 2,250,000 documents
     • Candle: 2.25 M × 160 B = 360 MB
     • Features: 2.25 M × 200 B = 450 MB
     → Subtotal:   810 MB

   Raw total: 1,260 + 1,134 + 810 = 3,204 MB (~3.2 GB)

4. Total Storage with Overhead
   – Raw data:       3.2 GB
   – Indexes (20%):  0.64 GB
   – MongoDB overhead (~30%): 0.96 GB
   → Total: ~4.8 GB

   With WiredTiger compression (~75%): ~1.2 GB

5. Recommended Disk Allocation
   • Development
     – Minimum: 6 GB
     – Recommended: 10 GB
   • Production
     – Minimum: 15 GB
     – Recommended: 30 GB
   • Enterprise/Scale
     – 5,000 stocks: ~8 GB raw, ~12 GB total, ~2 GB compressed
     – 10,000 stocks: ~16 GB raw, ~24 GB total, ~4 GB compressed

6. Storage Optimization Strategies

   6.1 Schema Configuration (WiredTiger compression)
