#!/usr/bin/env ts-node

import { SharedDatabase } from '../../shared/database';
import { logger } from '../../shared/utils/logger';
import { Stock } from '../../shared/models';
import UpstoxService from '../../services/upstox-service/src/services/UpstoxService';
import { UPSTOX_INTERVALS, POPULATION_PHASES } from '../../services/upstox-service/src/types/upstox';

interface PopulationConfig {
  accessToken: string;
  batchSize: number;
  delayBetweenBatches: number; // milliseconds
  delayBetweenStocks: number; // milliseconds
  maxRetries: number;
}

class HistoricalDataPopulator {
  private upstoxService: UpstoxService;
  private config: PopulationConfig;
  private stats = {
    totalStocks: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
    phases: {
      phase1: { processed: 0, successful: 0, failed: 0 },
      phase2: { processed: 0, successful: 0, failed: 0 },
      phase3: { processed: 0, successful: 0, failed: 0 }
    },
    startTime: new Date(),
    endTime: null as Date | null
  };

  constructor(config: PopulationConfig) {
    this.config = config;
    this.upstoxService = new UpstoxService();
    this.upstoxService.setAccessToken(config.accessToken);
  }

  public async populateHistoricalData(): Promise<void> {
    try {
      logger.info('Starting historical data population with updated retention strategy');
      logger.info('New Strategy:');
      logger.info('- 15min candles: Last 60 days');
      logger.info('- 1hour candles: Last 180 days');
      logger.info('- Daily candles: Last 3 years');
      
      // Get all equity stocks
      const equityStocks = await Stock.find({
        instrumentType: 'EQ',
        isActive: true,
        instrumentKey: { $exists: true, $ne: null }
      }).select('symbol instrumentKey name');

      this.stats.totalStocks = equityStocks.length;
      logger.info(`Found ${this.stats.totalStocks} equity stocks to populate`);

      if (this.stats.totalStocks === 0) {
        logger.warn('No equity stocks found with instrument keys');
        return;
      }

      // Process in three phases with updated retention
      await this.executePhase('phase1', equityStocks);
      await this.executePhase('phase2', equityStocks);
      await this.executePhase('phase3', equityStocks);

      this.stats.endTime = new Date();
      this.logFinalStats();

    } catch (error) {
      logger.error('Population failed:', error);
      throw error;
    }
  }

  private async executePhase(phaseKey: keyof typeof POPULATION_PHASES, stocks: any[]): Promise<void> {
    const phase = POPULATION_PHASES[phaseKey];
    logger.info(`\n=== Starting ${phase.name.toUpperCase()} ===`);
    logger.info(`Description: ${phase.description}`);
    
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - phase.startDaysAgo);
    
    const toDate = new Date();
    toDate.setDate(toDate.getDate() - phase.endDaysAgo);
    
    logger.info(`Date range: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);
    logger.info(`Timeframe: ${phase.timeframe.mongoTimeframe}`);

    // Process in batches
    const batches = this.createBatches(stocks, this.config.batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      logger.info(`${phase.name} - Processing batch ${i + 1}/${batches.length} (${batch.length} stocks)`);
      
      await this.processPhaseBatch(phaseKey, batch, phase.timeframe, fromDate, toDate);
      
      // Delay between batches
      if (i < batches.length - 1) {
        logger.info(`Waiting ${this.config.delayBetweenBatches}ms before next batch...`);
        await this.sleep(this.config.delayBetweenBatches);
      }
    }
    
    const phaseStats = this.stats.phases[phaseKey];
    logger.info(`${phase.name} completed: ${phaseStats.successful}/${phaseStats.processed} successful`);
  }

  private async processPhaseBatch(
    phaseKey: keyof typeof POPULATION_PHASES,
    stocks: any[],
    timeframe: any,
    fromDate: Date,
    toDate: Date
  ): Promise<void> {
    const batchPromises = stocks.map(stock => 
      this.processStockPhase(phaseKey, stock, timeframe, fromDate, toDate)
    );
    const results = await Promise.allSettled(batchPromises);
    
    results.forEach((result, index) => {
      const stock = stocks[index]!;
      this.stats.processed++;
      this.stats.phases[phaseKey].processed++;
      
      if (result.status === 'fulfilled') {
        if (result.value) {
          this.stats.successful++;
          this.stats.phases[phaseKey].successful++;
          logger.debug(`✓ ${phaseKey}: ${stock.symbol}`);
        } else {
          this.stats.skipped++;
          logger.debug(`- ${phaseKey}: ${stock.symbol} (skipped)`);
        }
      } else {
        this.stats.failed++;
        this.stats.phases[phaseKey].failed++;
        const error = `✗ ${phaseKey}: ${stock.symbol}: ${result.reason}`;
        this.stats.errors.push(error);
        logger.error(error);
      }
    });
    
    this.logProgress();
  }

  private async processStockPhase(
    phaseKey: keyof typeof POPULATION_PHASES,
    stock: any,
    timeframe: any,
    fromDate: Date,
    toDate: Date
  ): Promise<boolean> {
    try {
      // Add delay between individual stock requests
      await this.sleep(this.config.delayBetweenStocks);
      
      // Check if data already exists for this timeframe and date range
      const { Candle } = await import('../../shared/models');
      
      const existingData = await Candle.findOne({
        symbol: stock.symbol,
        timeframe: timeframe.mongoTimeframe,
        timestamp: {
          $gte: fromDate,
          $lte: toDate
        }
      });

      if (existingData) {
        logger.debug(`${stock.symbol} ${timeframe.mongoTimeframe} data already exists for this range, skipping`);
        return false;
      }

      // Fetch and populate data
      await this.upstoxService.syncEquityHistoricalData(
        stock.symbol,
        timeframe,
        fromDate,
        toDate
      );

      logger.debug(`✓ ${phaseKey}: ${stock.symbol} ${timeframe.mongoTimeframe} from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);
      return true;

    } catch (error) {
      logger.error(`Error in ${phaseKey} for ${stock.symbol}:`, error);
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

  private logProgress(): void {
    const percentage = ((this.stats.processed / (this.stats.totalStocks * 3)) * 100).toFixed(1); // 3 phases
    const elapsed = Date.now() - this.stats.startTime.getTime();
    const remaining = (this.stats.totalStocks * 3) - this.stats.processed;
    const avgTimePerStock = elapsed / this.stats.processed;
    const eta = new Date(Date.now() + (remaining * avgTimePerStock));
    
    logger.info(`Overall Progress: ${this.stats.processed}/${this.stats.totalStocks * 3} (${percentage}%) | Success: ${this.stats.successful} | Failed: ${this.stats.failed} | ETA: ${eta.toLocaleTimeString()}`);
  }

  private logFinalStats(): void {
    const duration = (this.stats.endTime!.getTime() - this.stats.startTime.getTime()) / 1000 / 60; // minutes
    
    logger.info('\n=== HISTORICAL DATA POPULATION COMPLETED ===');
    logger.info('Updated Retention Strategy Results:');
    logger.info(`Total Stock-Phase Combinations: ${this.stats.totalStocks * 3}`);
    logger.info(`Total Processed: ${this.stats.processed}`);
    logger.info(`Total Successful: ${this.stats.successful}`);
    logger.info(`Total Failed: ${this.stats.failed}`);
    logger.info(`Total Skipped: ${this.stats.skipped}`);
    logger.info(`Duration: ${duration.toFixed(2)} minutes`);
    
    logger.info('\nPhase Breakdown:');
    Object.entries(POPULATION_PHASES).forEach(([key, phase]) => {
      const phaseStats = this.stats.phases[key as keyof typeof POPULATION_PHASES];
      logger.info(`${phase.name}: ${phaseStats.successful}/${phaseStats.processed} successful (${phase.description})`);
    });
    
    logger.info('\nStorage Benefits with New Retention:');
    logger.info('- 15min data: 60 days (vs 180 days) = 67% reduction');
    logger.info('- 1hour data: 180 days (vs 6 months) = Same retention');
    logger.info('- Daily data: 3 years = Same retention');
    logger.info('- Overall storage reduction: ~40% compared to old strategy');
    
    if (this.stats.errors.length > 0) {
      logger.info('\nErrors:');
      this.stats.errors.forEach(error => logger.error(error));
    }
    
    logger.info('\n=== END ===');
  }
}

// CLI interface
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let accessToken = '';
    let batchSize = 5;
    let delayBetweenBatches = 5000;
    let delayBetweenStocks = 200;
    
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
      console.error('Usage: ts-node populate-historical-data.ts --token <ACCESS_TOKEN> [options]');
      console.error('Options:');
      console.error('  --batch-size <number>    Number of stocks to process simultaneously (default: 5)');
      console.error('  --batch-delay <ms>       Delay between batches in milliseconds (default: 5000)');
      console.error('  --stock-delay <ms>       Delay between individual stocks in milliseconds (default: 200)');
      console.error('');
      console.error('Updated Retention Strategy:');
      console.error('  - 15min candles: Last 60 days');
      console.error('  - 1hour candles: Last 180 days');
      console.error('  - Daily candles: Last 3 years');
      process.exit(1);
    }
    let db = SharedDatabase.getInstance();
    // Connect to database
    await db.connect('population-service');
    logger.info('Connected to MongoDB');
    
    // Create and run populator
    const config: PopulationConfig = {
      accessToken,
      batchSize,
      delayBetweenBatches,
      delayBetweenStocks,
      maxRetries: 3
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

// Run if called directly
if (require.main === module) {
  main();
}

export default HistoricalDataPopulator;