#!/usr/bin/env ts-node

import 'dotenv/config'
import axios from 'axios'
import { SharedDatabase, ClickHouseDatabase } from '../../shared/database'
import { logger } from '../../shared/utils/logger'
import { Stock } from '../../shared/models'  // MongoDB for stocks
import { ClickHouseCandle, ClickHouseCandleFeatures } from '../../shared/models'  // ClickHouse for candles/features
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

    // bulk upsert using ClickHouse
    const candleModel = new ClickHouseCandle()
    await candleModel.bulkUpsert(unique)

    return unique.length
  }

  /**
   * Calculate and save technical indicators for ClickHouse
   */
  async calculateAndSaveFeatures(symbol: string, timeframe: string) {
    try {
      logger.info(`Calculating features for ${symbol} ${timeframe}...`)
      
      const candleModel = new ClickHouseCandle()
      const candles = await candleModel.getRecentCandles(symbol, timeframe, 200)
      
      if (candles.length < 20) {
        logger.info(`Not enough candles (${candles.length}) for feature calculation`)
        return
      }
      
      // Reverse to get chronological order for calculations
      candles.reverse()
      
      // Calculate features based on timeframe
      const features = this.calculateTechnicalIndicators(candles, timeframe)
      
      // Save features for recent candles (last 50)
      const recentCandles = candles.slice(-50)
      const featureDocuments = []
      
      for (let i = 0; i < recentCandles.length; i++) {
        const candle = recentCandles[i]
        const candleFeatures = this.getFeaturesForCandle(features, i, timeframe)
        
        if (Object.keys(candleFeatures).length > 0) {
          featureDocuments.push({
            symbol: symbol,
            timeframe: timeframe as any,
            timestamp: candle.timestamp,
            candleRef: `${symbol}_${timeframe}_${candle.timestamp.getTime()}`,
            ...candleFeatures
          })
        }
      }
      
      if (featureDocuments.length > 0) {
        const featuresModel = new ClickHouseCandleFeatures()
        await featuresModel.bulkUpsert(featureDocuments)
        logger.info(`✅ Saved features for ${featureDocuments.length} ${timeframe} candles`)
      }
      
    } catch (error) {
      logger.error(`Failed to calculate features for ${symbol}:`, error)
    }
  }

  // Technical indicator calculation methods
  calculateTechnicalIndicators(candles: any[], timeframe: string): any {
    const closes = candles.map(c => c.close)
    const highs = candles.map(c => c.high)
    const lows = candles.map(c => c.low)
    const volumes = candles.map(c => c.volume)
    
    const features: any = {}
    
    // Simple Moving Averages
    features.sma5 = this.calculateSMA(closes, 5)
    features.sma10 = this.calculateSMA(closes, 10)
    features.sma20 = this.calculateSMA(closes, 20)
    features.sma50 = this.calculateSMA(closes, 50)
    features.sma200 = this.calculateSMA(closes, 200)
    
    // RSI
    features.rsi = this.calculateRSI(closes, 14)
    features.rsi14 = features.rsi
    
    // Volume indicators
    features.volumeSma = this.calculateSMA(volumes, 20)
    features.vwap = this.calculateVWAP(candles)
    
    // ATR
    features.atr = this.calculateATR(highs, lows, closes, 14)
    
    // Simple trend detection
    features.trendDirection = this.calculateTrend(closes)
    
    return features
  }
  
  getFeaturesForCandle(allFeatures: any, index: number, timeframe: string): any {
    const result: any = {}
    
    // Map features based on timeframe
    const featureMapping = {
      sma5: allFeatures.sma5?.[index],
      sma10: allFeatures.sma10?.[index],
      sma20: allFeatures.sma20?.[index], 
      sma50: allFeatures.sma50?.[index],
      sma200: allFeatures.sma200?.[index],
      rsi: allFeatures.rsi?.[index],
      rsi14: allFeatures.rsi14?.[index],
      volumeSma: allFeatures.volumeSma?.[index],
      vwap: allFeatures.vwap?.[index],
      atr: allFeatures.atr?.[index],
      trendDirection: allFeatures.trendDirection?.[index]
    }
    
    // Only include non-null values
    for (const [key, value] of Object.entries(featureMapping)) {
      if (value !== undefined && value !== null) {
        result[key] = Number(value.toFixed(4))
      }
    }
    
    return result
  }
  
  calculateSMA(prices: number[], period: number): number[] {
    const sma = []
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        sma.push(null)
      } else {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
        sma.push(sum / period)
      }
    }
    return sma
  }
  
  calculateRSI(closes: number[], period: number = 14): number[] {
    const rsi = []
    const gains = []
    const losses = []
    
    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1]
      gains.push(change > 0 ? change : 0)
      losses.push(change < 0 ? Math.abs(change) : 0)
    }
    
    for (let i = 0; i < closes.length; i++) {
      if (i < period) {
        rsi.push(null)
      } else {
        const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period
        const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period
        const rs = avgGain / (avgLoss || 0.0001)
        rsi.push(100 - (100 / (1 + rs)))
      }
    }
    
    return rsi
  }
  
  calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
    const atr = []
    const trueRanges = []
    
    for (let i = 1; i < closes.length; i++) {
      const tr1 = highs[i] - lows[i]
      const tr2 = Math.abs(highs[i] - closes[i - 1])
      const tr3 = Math.abs(lows[i] - closes[i - 1])
      trueRanges.push(Math.max(tr1, tr2, tr3))
    }
    
    for (let i = 0; i < closes.length; i++) {
      if (i < period) {
        atr.push(null)
      } else {
        const avgTR = trueRanges.slice(i - period, i).reduce((a, b) => a + b, 0) / period
        atr.push(avgTR)
      }
    }
    
    return atr
  }
  
  calculateVWAP(candles: any[]): number[] {
    const vwap = []
    let cumulativeVolume = 0
    let cumulativeVolumePrice = 0
    
    for (const candle of candles) {
      const typical = (candle.high + candle.low + candle.close) / 3
      cumulativeVolumePrice += typical * candle.volume
      cumulativeVolume += candle.volume
      vwap.push(cumulativeVolume > 0 ? cumulativeVolumePrice / cumulativeVolume : typical)
    }
    
    return vwap
  }
  
  calculateTrend(closes: number[]): number[] {
    const trend = []
    const period = 10
    
    for (let i = 0; i < closes.length; i++) {
      if (i < period) {
        trend.push(0)
      } else {
        const current = closes[i]
        const past = closes[i - period]
        trend.push(current > past ? 1 : (current < past ? -1 : 0))
      }
    }
    
    return trend
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

    // Connect to both databases
    await SharedDatabase.getInstance().connect('populate-historical')
    logger.info('✅ Connected to MongoDB')
    
    await ClickHouseDatabase.getInstance().connect('populate-historical')
    logger.info('✅ Connected to ClickHouse')

    // Get stocks from MongoDB
    const equityStocks = await Stock.find({
      instrumentType: 'EQ',
      isActive: true,
      instrumentKey: { $exists: true, $ne: null }
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

