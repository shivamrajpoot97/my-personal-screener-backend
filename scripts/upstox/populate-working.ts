#!/usr/bin/env ts-node

import 'dotenv/config';
import axios from 'axios';
import { SharedDatabase } from '../../shared/database';
import { logger } from '../../shared/utils/logger';
import { Stock, Candle } from '../../shared/models';

interface PopulationConfig {
  accessToken: string;
  batchSize: number;
  delayBetweenBatches: number;
  delayBetweenStocks: number;
}

// Simple Upstox service without complex dependencies
class SimpleUpstoxService {
  private accessToken: string;
  private baseUrl = 'https://api.upstox.com/v2';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/json'
    };
  }

  async testConnection(): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/user/profile`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Connection failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async fetchHistoricalCandles(
    instrumentKey: string,
    interval: string,
    fromDate: Date,
    toDate: Date
  ): Promise<number[][]> {
    try {
      const fromStr = fromDate.toISOString().split('T')[0];
      const toStr = toDate.toISOString().split('T')[0];
      
      const url = `${this.baseUrl}/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${toStr}/${fromStr}`;
      
      const response = await axios.get(url, {
        headers: this.getHeaders()
      });

      if (response.data.status === 'success' && response.data.data?.candles) {
        return response.data.data.candles;
      }
      
      throw new Error(`API Error: ${response.data.status || 'Unknown error'}`);
    } catch (error: any) {
      logger.error(`Failed to fetch data for ${instrumentKey}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async syncEquityHistoricalData(
    symbol: string,
    timeframe: any,
    fromDate: Date,
    toDate: Date
  ): Promise<void> {
    try {
      const stock = await Stock.findOne({ 
        symbol, 
        instrumentType: 'EQ',
        isActive: true 
      });

      if (!stock || !stock.instrumentKey) {
        throw new Error(`Stock ${symbol} not found or missing instrument key`);
      }

      const candles = await this.fetchHistoricalCandles(
        stock.instrumentKey,
        timeframe.upstoxInterval,
        fromDate,
        toDate
      );

      if (candles.length === 0) {
        logger.info(`No candles found for ${symbol}`);
        return;
      }

      // Parse and save candles
      const candleDocuments = candles.map(candleArray => {
        return {
          symbol: symbol.toUpperCase(),
          timeframe: timeframe.mongoTimeframe,
          timestamp: new Date(candleArray[0]!),
          open: candleArray[1]!,
          high: candleArray[2]!,
          low: candleArray[3]!,
          close: candleArray[4]!,
          volume: candleArray[5]!,
          openInterest: candleArray[6] || undefined
        };
      });

      // Bulk upsert
      if (candleDocuments.length > 0) {
        await Candle.bulkWrite(
          candleDocuments.map(doc => ({
            updateOne: {
              filter: { 
                symbol: doc.symbol,
                timeframe: doc.timeframe,
                timestamp: doc.timestamp
              },
              update: { $set: doc },
              upsert: true
            }
          }))
        );

        logger.info(`Saved ${candleDocuments.length} ${timeframe.mongoTimeframe} candles for ${symbol}`);
      }

    } catch (error) {
      logger.error(`Failed to sync historical data for ${symbol}:`, error);
      throw error;
    }
  }
}

// Timeframe configurations
const TIMEFRAMES = {
  '15min': {
    upstoxInterval: '15minute',
    mongoTimeframe: '15min',
    days: 60
  },
  '1hour': {
    upstoxInterval: '1hour',
    mongoTimeframe: '1hour',
    days: 180
  },
  '1day': {
    upstoxInterval: '1day',
    mongoTimeframe: '1day',
    days: 1095
  }
};

class HistoricalDataPopulator {
  private upstoxService: SimpleUpstoxService;
  private config: PopulationConfig;
  private stats = {
    totalStocks: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
    startTime: new Date(),
    endTime: null as Date | null
  };

  constructor(config: PopulationConfig) {
    this.config = config;
    this.upstoxService = new SimpleUpstoxService(config.accessToken);
  }

  public async populateHistoricalData(): Promise<void> {
    try {
      logger.info('Starting historical data population...');
      
      // Test connection first
      await this.upstoxService.testConnection();
      logger.info('✓ Upstox connection successful');
      
      // Get equity stocks
      const equityStocks = await Stock.find({
        instrumentType: 'EQ',
        isActive: true,
        instrumentKey: { $exists: true, $ne: null }
      }).select('symbol instrumentKey name').limit(10); // Limit for testing

      this.stats.totalStocks = equityStocks.length;
      logger.info(`Found ${this.stats.totalStocks} equity stocks to populate`);

      if (this.stats.totalStocks === 0) {
        logger.warn('No equity stocks found with instrument keys');
        return;
      }

      // Process each timeframe
      for (const [timeframeKey, timeframe] of Object.entries(TIMEFRAMES)) {
        logger.info(`\n=== Processing ${timeframeKey} data ===`);
        
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - timeframe.days);
        
        logger.info(`Date range: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);

        // Process stocks in batches
        const batches = this.createBatches(equityStocks, this.config.batchSize);
        
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i]!;
          logger.info(`Processing batch ${i + 1}/${batches.length} (${batch.length} stocks)`);
          
          await this.processBatch(batch, timeframe, fromDate, toDate);
          
          if (i < batches.length - 1) {
            logger.info(`Waiting ${this.config.delayBetweenBatches}ms before next batch...`);
            await this.sleep(this.config.delayBetweenBatches);
          }
        }
      }

      this.stats.endTime = new Date();
      this.logFinalStats();

    } catch (error) {
      logger.error('Population failed:', error);
      throw error;
    }
  }

  private async processBatch(
    stocks: any[],
    timeframe: any,
    fromDate: Date,
    toDate: Date
  ): Promise<void> {
    const promises = stocks.map(stock => this.processStock(stock, timeframe, fromDate, toDate));
    const results = await Promise.allSettled(promises);
    
    results.forEach((result, index) => {
      const stock = stocks[index]!;
      this.stats.processed++;
      
      if (result.status === 'fulfilled') {
        if (result.value) {
          this.stats.successful++;
          logger.debug(`✓ ${stock.symbol}`);
        } else {
          this.stats.skipped++;
          logger.debug(`- ${stock.symbol} (skipped)`);
        }
      } else {
        this.stats.failed++;
        const error = `✗ ${stock.symbol}: ${result.reason}`;
        this.stats.errors.push(error);
        logger.error(error);
      }
    });
  }

  private async processStock(
    stock: any,
    timeframe: any,
    fromDate: Date,
    toDate: Date
  ): Promise<boolean> {
    try {
      await this.sleep(this.config.delayBetweenStocks);
      
      // Check if data exists
      const existingData = await Candle.findOne({
        symbol: stock.symbol,
        timeframe: timeframe.mongoTimeframe,
        timestamp: { $gte: fromDate, $lte: toDate }
      });

      if (existingData) {
        logger.debug(`${stock.symbol} ${timeframe.mongoTimeframe} data already exists, skipping`);
        return false;
      }

      await this.upstoxService.syncEquityHistoricalData(
        stock.symbol,
        timeframe,
        fromDate,
        toDate
      );

      return true;
    } catch (error) {
      logger.error(`Error processing ${stock.symbol}:`, error);
      throw error;
    }
  }

  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private logFinalStats(): void {
    const duration = (this.stats.endTime!.getTime() - this.stats.startTime.getTime()) / 1000 / 60;
    
    logger.info('\n=== POPULATION COMPLETED ===');
    logger.info(`Total Processed: ${this.stats.processed}`);
    logger.info(`Successful: ${this.stats.successful}`);
    logger.info(`Failed: ${this.stats.failed}`);
    logger.info(`Skipped: ${this.stats.skipped}`);
    logger.info(`Duration: ${duration.toFixed(2)} minutes`);
    
    if (this.stats.errors.length > 0) {
      logger.info('\nErrors:');
      this.stats.errors.forEach(error => logger.error(error));
    }
  }
}

// CLI interface
async function main() {
  try {
    const args = process.argv.slice(2);
    let accessToken = '';
    let batchSize = 3;
    let delayBetweenBatches = 5000;
    let delayBetweenStocks = 300;
    
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i];
      const value = args[i + 1];
      
      switch (flag) {
        case '--token':
          accessToken = value!;
          break;
        case '--batch-size':
          batchSize = parseInt(value!);
          break;
        case '--batch-delay':
          delayBetweenBatches = parseInt(value!);
          break;
        case '--stock-delay':
          delayBetweenStocks = parseInt(value!);
          break;
      }
    }
    
    if (!accessToken) {
      console.error('Usage: ts-node populate-working.ts --token <ACCESS_TOKEN> [options]');
      console.error('Options:');
      console.error('  --batch-size <number>    Stocks per batch (default: 3)');
      console.error('  --batch-delay <ms>       Delay between batches (default: 5000)');
      console.error('  --stock-delay <ms>       Delay between stocks (default: 300)');
      process.exit(1);
    }
    
    // Connect to database
    const db = SharedDatabase.getInstance();
    await db.connect('population-service');
    logger.info('✓ Connected to MongoDB');
    
    const config: PopulationConfig = {
      accessToken,
      batchSize,
      delayBetweenBatches,
      delayBetweenStocks
    };
    
    const populator = new HistoricalDataPopulator(config);
    await populator.populateHistoricalData();
    
    logger.info('Historical data population completed successfully');
    process.exit(0);
    
  } catch (error) {
    logger.error('Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default HistoricalDataPopulator;