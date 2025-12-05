#!/usr/bin/env tsx
/**
 * Quick script to check candle data availability
 * Usage: npm run check-candles [-- --symbol=RELIANCE]
 */

import 'dotenv/config';
import { ClickHouseDatabase } from '../shared/database';
import { logger } from '../shared/utils/logger';

class CandleChecker {
  private clickhouse: ClickHouseDatabase;

  constructor() {
    this.clickhouse = ClickHouseDatabase.getInstance();
  }

  async initialize(): Promise<void> {
    await this.clickhouse.connect('check-candles');
    logger.info('✅ Connected to ClickHouse');
  }

  async checkSymbol(symbol: string): Promise<void> {
    logger.info(`\n📊 Checking candle data for: ${symbol}`);
    logger.info('='.repeat(60));

    const timeframes = ['15min', '1hour', '1day'];

    for (const timeframe of timeframes) {
      try {
        const query = `
          SELECT 
            count() as total_candles,
            min(timestamp) as first_candle,
            max(timestamp) as last_candle,
            round(avg(volume), 2) as avg_volume
          FROM screener_db.candles
          WHERE symbol = '${symbol}'
            AND timeframe = '${timeframe}'
        `;

        const result = await this.clickhouse.query(query);
        
        if (result[0]) {
          const data = result[0];
          logger.info(`\n${timeframe.toUpperCase()}:`);
          logger.info(`  Total Candles: ${data.total_candles}`);
          logger.info(`  First Candle:  ${data.first_candle || 'N/A'}`);
          logger.info(`  Last Candle:   ${data.last_candle || 'N/A'}`);
          logger.info(`  Avg Volume:    ${data.avg_volume || 0}`);

          if (data.total_candles === 0) {
            logger.warn(`  ⚠️  No ${timeframe} candles found!`);
          } else {
            // Check gap from last candle to now
            const lastCandle = new Date(data.last_candle);
            const daysSinceLastCandle = Math.floor(
              (Date.now() - lastCandle.getTime()) / (1000 * 60 * 60 * 24)
            );
            
            if (daysSinceLastCandle > 7) {
              logger.warn(`  ⚠️  Last candle is ${daysSinceLastCandle} days old`);
            } else {
              logger.info(`  ✅ Data is up to date`);
            }
          }
        }
      } catch (error) {
        logger.error(`Error checking ${timeframe}:`, error);
      }
    }

    logger.info('\n' + '='.repeat(60));
  }

  async checkOverview(): Promise<void> {
    logger.info('\n📊 Overall Candle Data Overview');
    logger.info('='.repeat(60));

    try {
      const query = `
        SELECT 
          timeframe,
          count(DISTINCT symbol) as unique_symbols,
          count() as total_candles,
          min(timestamp) as earliest_data,
          max(timestamp) as latest_data
        FROM screener_db.candles
        GROUP BY timeframe
        ORDER BY timeframe
      `;

      const results = await this.clickhouse.query(query);

      for (const row of results) {
        logger.info(`\n${row.timeframe.toUpperCase()}:`);
        logger.info(`  Unique Symbols: ${row.unique_symbols}`);
        logger.info(`  Total Candles:  ${row.total_candles}`);
        logger.info(`  Earliest Data:  ${row.earliest_data}`);
        logger.info(`  Latest Data:    ${row.latest_data}`);
      }

      // Check top symbols by data availability
      const topSymbolsQuery = `
        SELECT 
          symbol,
          count() as total_candles
        FROM screener_db.candles
        WHERE timeframe = '1day'
        GROUP BY symbol
        ORDER BY total_candles DESC
        LIMIT 10
      `;

      const topSymbols = await this.clickhouse.query(topSymbolsQuery);
      
      logger.info('\n🏆 Top 10 Symbols by Daily Candle Count:');
      topSymbols.forEach((row: any, idx: number) => {
        logger.info(`  ${idx + 1}. ${row.symbol}: ${row.total_candles} candles`);
      });

    } catch (error) {
      logger.error('Error checking overview:', error);
    }

    logger.info('\n' + '='.repeat(60));
  }

  async cleanup(): Promise<void> {
    await this.clickhouse.disconnect('check-candles');
  }
}

async function main() {
  const args = process.argv.slice(2);
  let symbol: string | null = null;

  // Parse arguments
  args.forEach(arg => {
    if (arg.startsWith('--symbol=')) {
      symbol = arg.split('=')[1];
    }
  });

  const checker = new CandleChecker();

  try {
    await checker.initialize();

    if (symbol) {
      await checker.checkSymbol(symbol.toUpperCase());
    } else {
      await checker.checkOverview();
    }

    await checker.cleanup();
    process.exit(0);
  } catch (error) {
    logger.error('Check failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default CandleChecker;
