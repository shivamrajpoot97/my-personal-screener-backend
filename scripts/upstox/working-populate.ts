#!/usr/bin/env ts-node

import 'dotenv/config'
import axios from 'axios'
import { SharedDatabase } from '../../shared/database'
import { logger } from '../../shared/utils/logger'
import { Stock, Candle } from '../../shared/models'
import { TIMEFRAME_FEATURES } from '../../shared/models/CandleFeatures'

// Simple Upstox service
class SimpleUpstoxService {
  private accessToken: string
  private baseUrl = 'https://api.upstox.com/v3'

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
  }

  async fetchHistoricalCandles(
    instrumentKey: string,
    interval: string,
    fromDate: Date,
    toDate: Date
  ): Promise<any[]> {
    try {
      const fromStr = fromDate.toISOString().split('T')[0]
      const toStr = toDate.toISOString().split('T')[0]
      
      const url = `${this.baseUrl}/historical-candle/${encodeURIComponent(
        instrumentKey
      )}/${interval}/${toStr}/${fromStr}`
      logger.info(`Fetching candles from: ${url}`)
      
      const response = await axios.get(url, {
        headers: this.getHeaders(),
      })
      if (response.data.status === 'success' && response.data.data?.candles) {
        return response.data.data.candles
      }
      
      logger.warn(`No candles received for ${instrumentKey}`)
      return []
    } catch (error: any) {
      logger.error(
        `Failed to fetch data for ${instrumentKey}:`,
        error.response?.data || error.message
      )
      return []
    }
  }

  /**
   * Downloads data in chunks (according to API limits), bulk‐writes them,
   * and then computes features for that symbol+timeframe.
   */
  async syncStockData(
    stock: any,
    interval: string,
    mongoTimeframe: string,
    fromDate: Date,
    toDate: Date
  ): Promise<number> {
    try {
      // define your max days per request by interval
      const apiLimits: Record<string, number> = {
        'minutes/15': 30,   // e.g. max 30 days at once
        'hours/1': 90,   // max 90 days
        'days/1': 365,      // max 1 year
      }

      const maxDays = apiLimits[interval] || 30
      const totalRangeDays = Math.floor(
        (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)
      )
      logger.info(
        `${stock.symbol}: need ${totalRangeDays} days, API limit per call: ${maxDays} days`
      )

      const allCandles: any[] = []
      let cursor = new Date(fromDate)

      while (cursor < toDate) {
        // compute chunk end
        const chunkEnd = new Date(
          Math.min(
            cursor.getTime() + maxDays * 24 * 60 * 60 * 1000,
            toDate.getTime()
          )
        )

      logger.info(
          `${stock.symbol}: fetching chunk ${cursor
            .toISOString()
            .slice(0, 10)} → ${chunkEnd.toISOString().slice(0, 10)}`
        )
        const chunk = await this.fetchHistoricalCandles(
          stock.instrumentKey,
          interval,
          cursor,
          chunkEnd
        )
        if (chunk.length) {
          logger.info(`→ got ${chunk.length} candles`)
          allCandles.push(...chunk)
        }

        // advance cursor past this chunk (+1 day to prevent overlap)
        cursor = new Date(chunkEnd.getTime() + 24 * 60 * 60 * 1000)

        // short delay to respect rate limits
        if (cursor < toDate) {
          await new Promise((r) => setTimeout(r, 500))
        }
      }

      if (!allCandles.length) {
        logger.info(`No candles fetched for ${stock.symbol}`)
        return 0
      }

      // bulk‐write and return count
      const saved = await this.processCandleData(
              stock,
        mongoTimeframe,
        allCandles
            )
      logger.info(
        `✅ ${stock.symbol}: saved ${saved} ${mongoTimeframe} candles (before features)`
      )

      // now compute & persist features (e.g. ATR, EMA, etc.)
      await this.calculateAndSaveFeatures(stock.symbol, mongoTimeframe)
      logger.info(`🔧 ${stock.symbol}: features updated for ${mongoTimeframe}`)

      return saved
    } catch (err) {
      logger.error(`Failed to sync ${stock.symbol}:`, err)
      return 0
    }
  }

  /**
   * Takes raw arrays of candles, dedupes, calculates basic fields,
   * and does a bulkWrite upsert.
   */
  async processCandleData(
    stock: any,
    mongoTimeframe: string,
    candles: any[]
  ): Promise<number> {
    // map to documents + derive straight‐away
    const docs = candles.map((arr) => {
      const ts = new Date(arr[0])
      const open = arr[1]
      const high = arr[2]
      const low = arr[3]
      const close = arr[4]
      const volume = arr[5]
      const oi = arr[6] || undefined

      // basic derived fields
      const priceChange = close - open
      const bodySize = Math.abs(priceChange)
      const bodyTop = Math.max(open, close)
      const bodyBottom = Math.min(open, close)

      return {
        symbol: stock.symbol.toUpperCase(),
        timeframe: mongoTimeframe,
        timestamp: ts,
        open,
        high,
        low,
        close,
        volume,
        openInterest: oi,
        // derived
        priceChange,
        priceChangePercent: (priceChange / open) * 100,
        range: high - low,
        bodySize,
        upperShadow: high - bodyTop,
        lowerShadow: bodyBottom - low,
      }
    })

    // remove any duplicates by timestamp
    const unique = docs.filter(
      (candle, idx, arr) =>
        arr.findIndex(
          (x) =>
            x.symbol === candle.symbol &&
            x.timeframe === candle.timeframe &&
            x.timestamp.getTime() === candle.timestamp.getTime()
        ) === idx
    )
    logger.info(
      `→ ${unique.length} unique candles (dropped ${docs.length -
        unique.length} duplicates)`
    )

    // bulk upsert
    const ops = unique.map((doc) => ({
      updateOne: {
        filter: {
          symbol: doc.symbol,
          timeframe: doc.timeframe,
          timestamp: doc.timestamp,
        },
        update: { $set: doc },
        upsert: true,
      },
    }))
    await Candle.bulkWrite(ops)

    return unique.length
  }

  /**
   * Stub for feature calculation.  Load all candles for symbol+tf,
   * apply your TIMEFRAME_FEATURES config, and bulk‐update those feature fields.
   */
  async calculateAndSaveFeatures(symbol: string, timeframe: string) {
    // 1) load all candles in ascending timestamp
    const candles = await Candle.find({ symbol, timeframe }).sort('timestamp')
    const featureCfg = TIMEFRAME_FEATURES[timeframe]
    if (!featureCfg || candles.length === 0) {
      return
}

    // 2) compute features for each candle …
    const updates = []
    for (let i = 0; i < candles.length; i++) {
      const doc = candles[i]
      const featValues: Record<string, number> = {}

      // your TIMEFRAME_FEATURES config might specify
      // periods for ATR, EMA, etc.  Loop and compute…
      for (const feature of featureCfg) {
        featValues[feature.name] = feature.compute(candles, i)
      }

      updates.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { features: featValues } },
        },
      })
    }

    if (updates.length) {
      await Candle.bulkWrite(updates)
    }
  }
}

// Timeframes to download
const TIMEFRAMES = [
  { interval: 'minutes/15', mongoTimeframe: '15min', days: 60 },
  { interval: 'hours/1', mongoTimeframe: '1hour', days: 120 },
  { interval: 'days/1',   mongoTimeframe: '1day',  days: 365 * 3 - 180 },
]
async function populateHistoricalData() {
  try {
    const token = process.env.UPSTOX_TOKEN
    if (!token) {
      console.error('UPSTOX_TOKEN not set')
      process.exit(1)
    }

    await SharedDatabase.getInstance().connect('populate-historical')
    logger.info('✅ Connected to MongoDB')

    const equityStocks = await Stock.find({
      instrumentType: 'EQ',
      isActive: true,
      instrumentKey: { $exists: true, $ne: null },
    }).select('symbol instrumentKey name')
    logger.info(`Found ${equityStocks.length} stocks to sync`)

    if (!equityStocks.length) {
      logger.warn('No equity stocks found')
      process.exit(0)
    }
    
    const service = new SimpleUpstoxService(token)
    let totalCandles = 0
      
    for (const tf of TIMEFRAMES) {
      logger.info(`\n=== ${tf.mongoTimeframe} (last ${tf.days} days) ===`)
      const toDate = new Date()
      const fromDate = new Date(toDate.getTime() - tf.days * 24 * 60 * 60 * 1000)

      logger.info(
        `Date range: ${fromDate.toISOString().slice(0, 10)} → ${toDate
          .toISOString()
          .slice(0, 10)}`
      )

      let processed = 0
      const batchSize = 10
      for (let i = 0; i < equityStocks.length; i += batchSize) {
        const batch = equityStocks.slice(i, i + batchSize)
        const batchNum = Math.floor(i / batchSize) + 1
        const totalBatches = Math.ceil(equityStocks.length / batchSize)
        logger.info(
          `\nBatch ${batchNum}/${totalBatches} — ${batch.length} symbols`
        )

        for (const stock of batch) {
          try {
            processed++
            logger.info(
              `[${processed}/${equityStocks.length}] ${stock.symbol}`
            )
            const count = await service.syncStockData(
              stock,
              tf.interval,
              tf.mongoTimeframe,
              fromDate,
              toDate
            )
            totalCandles += count
            await new Promise((r) => setTimeout(r, 300))
          } catch (innerErr) {
            logger.error(`Error processing ${stock.symbol}:`, innerErr)
          }
        }

        if (i + batchSize < equityStocks.length) {
          logger.info('Waiting 2s before next batch…')
          await new Promise((r) => setTimeout(r, 2000))
        }
      }

      logger.info(
        `✔️ Completed ${tf.mongoTimeframe}: ${processed} symbols processed\n`
      )
    }

    logger.info(`🎉 Done! Total candles saved: ${totalCandles}`)
    process.exit(0)
  } catch (err) {
    logger.error('Population failed:', err)
    process.exit(1)
  }
}

populateHistoricalData()

