#!/usr/bin/env tsx
/**
 * Script to check and populate missing candle data
 * Usage: npm run populate-candles [-- --days=30 --timeframe=1day]
 */

import 'dotenv/config';
import { SharedDatabase, ClickHouseDatabase } from '../shared/database';
import { Stock } from '../shared/models';
import { logger } from '../shared/utils/logger';
import axios from 'axios';

interface PopulateOptions {
  days?: number;
  timeframe?: '15min' | '1hour' | '1day';
  symbols?: string[];
  skipExisting?: boolean;
  batchSize?: number;
}

class CandlePopulator {
  private clickhouse: ClickHouseDatabase;
  private upstoxServiceUrl: string;
  private accessToken: string | null = null;

  constructor() {
    this.clickhouse = ClickHouseDatabase.getInstance();
    this.upstoxServiceUrl = process.env.UPSTOX_SERVICE_URL || 'http://localhost:3004';
  }

  /**
   * Initialize connections
   */
  async initialize(): Promise<void> {
    try {
      await SharedDatabase.getInstance().connect('populate-candles');
      logger.info('✅ Connected to MongoDB');

      await this.clickhouse.connect('populate-candles');
      logger.info('✅ Connected to ClickHouse');

      // Get Upstox token from environment or user
      this.accessToken = process.env.UPSTOX_ACCESS_TOKEN || null;
      if (!this.accessToken) {
        logger.warn('⚠️  No UPSTOX_ACCESS_TOKEN found. Live data fetch will not work.');
      }
    } catch (error) {
      logger.error('Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Check which stocks have missing candles
   */
  async checkMissingCandles(
    symbols: string[],
    timeframe: string,
    fromDate: Date,
    toDate: Date
  ): Promise<Map<string, { total: number; missing: number; lastCandle: Date | null }>> {
    const results = new Map();

    logger.info(`Checking ${symbols.length} stocks for missing ${timeframe} candles...`);

    for (const symbol of symbols) {
      try {
        // Check ClickHouse for existing candles
        const query = `
          SELECT 
            count() as count,
            max(timestamp) as last_timestamp
          FROM screener_db.candles
          WHERE symbol = '${symbol}'
            AND timeframe = '${timeframe}'
            AND timestamp >= '${fromDate.toISOString()}'
            AND timestamp <= '${toDate.toISOString()}'
        `;

        const result = await this.clickhouse.query(query);
        const existingCount = result[0]?.count || 0;
        const lastTimestamp = result[0]?.last_timestamp ? new Date(result[0].last_timestamp) : null;

        // Calculate expected candles based on timeframe
        const expectedCount = this.calculateExpectedCandles(fromDate, toDate, timeframe);
        const missingCount = Math.max(0, expectedCount - existingCount);

        results.set(symbol, {
          total: expectedCount,
          existing: existingCount,
          missing: missingCount,
          lastCandle: lastTimestamp
        });

        if (missingCount > 0) {
          logger.info(`${symbol}: ${missingCount} missing candles (${existingCount}/${expectedCount})`);
        }

      } catch (error) {
        logger.error(`Error checking ${symbol}:`, error);
        results.set(symbol, { total: 0, existing: 0, missing: 0, lastCandle: null });
      }
    }

    return results;
  }

  /**
   * Calculate expected number of candles
   */
  private calculateExpectedCandles(fromDate: Date, toDate: Date, timeframe: string): number {
    const diffMs = toDate.getTime() - fromDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    switch (timeframe) {
      case '15min':
        // ~26 15-min candles per trading day (6.5 hours)
        return Math.floor(diffDays * 26);
      case '1hour':
        // ~7 1-hour candles per trading day
        return Math.floor(diffDays * 7);
      case '1day':
        // 1 daily candle per trading day (excluding weekends/holidays)
        return Math.floor(diffDays * 0.71); // ~5 trading days per week
      default:
        return 0;
    }
  }

  /**
   * Fetch and populate missing candles for a stock
   */
  async populateStockCandles(
    symbol: string,
    timeframe: string,
    fromDate: Date,
    toDate: Date
  ): Promise<number> {
    try {
      logger.info(`Fetching ${timeframe} candles for ${symbol}...`);

      // Get stock info
      const stock = await Stock.findOne({ 
        symbol, 
        instrumentType: 'EQ',
        isActive: true 
      });

      if (!stock || !stock.instrumentKey) {
        logger.warn(`Stock ${symbol} not found or missing instrument key`);
        return 0;
      }

      // Map timeframe to Upstox interval
      const upstoxInterval = this.getUpstoxInterval(timeframe);
      
      // Fetch from Upstox
      const candles = await this.fetchUpstoxCandles(
        stock.instrumentKey,
        upstoxInterval,
        fromDate,
        toDate
      );

      if (candles.length === 0) {
        logger.warn(`No candles received for ${symbol}`);
        return 0;
      }

      // Transform and insert into ClickHouse
      const records = candles.map((candle: any[]) => {
        const [timestamp, open, high, low, close, volume, oi] = candle;
        const candleDate = new Date(timestamp);

        return {
          symbol: symbol,
          timeframe: timeframe,
          timestamp: candleDate,
          open: open,
          high: high,
          low: low,
          close: close,
          volume: volume || 0,
          open_interest: oi || null,
          price_change: close - open,
          price_change_percent: ((close - open) / open) * 100,
          range: high - low,
          body_size: Math.abs(close - open),
          upper_shadow: high - Math.max(open, close),
          lower_shadow: Math.min(open, close) - low,
          created_at: new Date(),
          updated_at: new Date()
        };
      });

      // Insert into ClickHouse
      if (records.length > 0) {
        await this.clickhouse.insert('screener_db.candles', records);
        logger.info(`✅ Inserted ${records.length} ${timeframe} candles for ${symbol}`);
      }

      return records.length;

    } catch (error) {
      logger.error(`Failed to populate candles for ${symbol}:`, error);
      return 0;
    }
  }

  /**
   * Fetch candles from Upstox API
   */
  private async fetchUpstoxCandles(
    instrumentKey: string,
    interval: string,
    fromDate: Date,
    toDate: Date
  ): Promise<any[]> {
    try {
      const fromDateStr = fromDate.toISOString().split('T')[0];
      const toDateStr = toDate.toISOString().split('T')[0];

      const url = `https://api.upstox.com/v2/historical-candle/${instrumentKey}/${interval}/${toDateStr}/${fromDateStr}`;
      
      const response = await axios.get(url, {
        headers: this.accessToken ? {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        } : {
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      if (response.data.status === 'success' && response.data.data?.candles) {
        return response.data.data.candles;
      }

      return [];
    } catch (error: any) {
      if (error.response?.status === 401) {
        logger.error('Upstox authentication failed. Please set UPSTOX_ACCESS_TOKEN');
      } else {
        logger.error(`Upstox API error for ${instrumentKey}:`, error.message);
      }
      throw error;
    }
  }

  /**
   * Map our timeframe to Upstox interval
   */
  private getUpstoxInterval(timeframe: string): string {
    const mapping: Record<string, string> = {
      '15min': '15minute',
      '1hour': '1hour',
      '1day': 'day'
    };
    return mapping[timeframe] || 'day';
  }

  /**
   * Main populate function
   */
  async populate(options: PopulateOptions = {}): Promise<void> {
    const {
      days = 30,
      timeframe = '1day',
      symbols: specificSymbols,
      skipExisting = true,
      batchSize = 10
    } = options;

    try {
      await this.initialize();

      // Get stocks to process
      let stocks: any[];
      if (specificSymbols && specificSymbols.length > 0) {
        stocks = await Stock.find({
          symbol: { $in: specificSymbols },
          instrumentType: 'EQ',
          isActive: true,
          instrumentKey: { $exists: true, $ne: null }
        });
      } else {
        stocks = await Stock.find({
          instrumentType: 'EQ',
          isActive: true,
          instrumentKey: { $exists: true, $ne: null }
        }).limit(100); // Limit to first 100 for safety
      }

      logger.info(`Found ${stocks.length} stocks to process`);

      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);

      logger.info(`Date range: ${fromDate.toISOString()} to ${toDate.toISOString()}`);

      // Check missing candles first
      const symbolList = stocks.map(s => s.symbol);
      const missingData = await this.checkMissingCandles(symbolList, timeframe, fromDate, toDate);

      // Filter stocks that need data
      const stocksToPopulate = stocks.filter(stock => {
        const info = missingData.get(stock.symbol);
        return info && info.missing > 0;
      });

      logger.info(`\n📊 Summary: ${stocksToPopulate.length} stocks need data population`);

      if (stocksToPopulate.length === 0) {
        logger.info('✅ All stocks have complete candle data!');
        return;
      }

      // Process in batches
      let totalInserted = 0;
      for (let i = 0; i < stocksToPopulate.length; i += batchSize) {
        const batch = stocksToPopulate.slice(i, i + batchSize);
        
        logger.info(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(stocksToPopulate.length / batchSize)}`);

        for (const stock of batch) {
          const inserted = await this.populateStockCandles(
            stock.symbol,
            timeframe,
            fromDate,
            toDate
          );
          totalInserted += inserted;

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }

      logger.info(`\n✅ Population complete! Inserted ${totalInserted} total candles`);

    } catch (error) {
      logger.error('Population failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Cleanup connections
   */
  async cleanup(): Promise<void> {
    try {
      await SharedDatabase.getInstance().disconnect('populate-candles');
      await this.clickhouse.disconnect('populate-candles');
      logger.info('Connections closed');
    } catch (error) {
      logger.error('Cleanup error:', error);
    }
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  
  const options: PopulateOptions = {
    days: 30,
    timeframe: '1day',
    skipExisting: true,
    batchSize: 10
  };

  // Parse arguments
  args.forEach(arg => {
    if (arg.startsWith('--days=')) {
      options.days = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--timeframe=')) {
      options.timeframe = arg.split('=')[1] as any;
    } else if (arg.startsWith('--symbols=')) {
      options.symbols = arg.split('=')[1].split(',');
    } else if (arg === '--no-skip') {
      options.skipExisting = false;
    } else if (arg.startsWith('--batch=')) {
      options.batchSize = parseInt(arg.split('=')[1]);
    }
  });

  logger.info('🚀 Starting Candle Data Population');
  logger.info(`Options: ${JSON.stringify(options, null, 2)}`);

  const populator = new CandlePopulator();
  
  try {
    await populator.populate(options);
    process.exit(0);
  } catch (error) {
    logger.error('Script failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export default CandlePopulator;