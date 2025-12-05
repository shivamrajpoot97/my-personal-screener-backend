#!/usr/bin/env ts-node

import 'dotenv/config';
import { SharedDatabase, ClickHouseDatabase } from '../../../shared/database';
import { logger } from '../../../shared/utils/logger';
import ScreenerService from './services/ScreenerService';

/**
 * CLI Runner for Screener Service
 * Run screeners from command line without starting the API server
 */

async function main() {
  try {
    console.log('\n🔍 Personal Screener - CLI Mode\n');

    // Parse command line arguments
    const args = process.argv.slice(2);
    const filterName = args[0] || 'wyckoff';
    const timeframe = (args[1] as any) || '1day';
    const limit = parseInt(args[2]) || 100;

    // Connect to databases
    console.log('Connecting to databases...');
    await SharedDatabase.getInstance().connect('screener-cli');
    logger.info('✅ Connected to MongoDB');

    await ClickHouseDatabase.getInstance().connect('screener-cli');
    logger.info('✅ Connected to ClickHouse');

    // Configure screener based on filter
    let config: any = {
      stockLimit: limit,
      batchSize: 10
    };

    if (filterName === 'wyckoff') {
      config.filters = {
        wyckoff: {
          minConfidence: 70,
          timeframe: timeframe,
          lookbackDays: 90
        }
      };
    } else {
      console.error(`Unknown filter: ${filterName}`);
      console.log('Available filters: wyckoff');
      process.exit(1);
    }

    // Run screener
    const screener = new ScreenerService(config);
    const results = await screener.scan();

    // Display results
    const formatted = ScreenerService.formatResults(results);
    console.log(formatted);

    // Save results to file
    const fs = require('fs');
    const outputFile = `screener-results-${Date.now()}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\n📁 Results saved to: ${outputFile}\n`);

    process.exit(0);

  } catch (error) {
    logger.error('CLI runner failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default main;