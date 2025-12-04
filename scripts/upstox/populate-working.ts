// CLI interface
const { logger } = require('../../shared/utils/logger');
const { SharedDatabase } = require('../../shared/database');
const {HistoricalDataPopulator} = require('./populate-historical-data-fixed');

interface PopulationConfig {
  accessToken: string;
  batchSize: number;
  delayBetweenBatches: number; // milliseconds
  delayBetweenStocks: number; // milliseconds
  //0maxRetries: number;
}

async function main() {
  try {
    // Try to get token from environment first, then command line
    let accessToken = process.env.UPSTOX_TOKEN || '';
    let batchSize = 3;
    let delayBetweenBatches = 5000;
    let delayBetweenStocks = 300;
    
    // If no env token, check command line
    if (!accessToken) {
      const args = process.argv.slice(2);
      
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
    }
    
    if (!accessToken) {
      console.error('Usage: UPSTOX_TOKEN=<token> npx ts-node populate-working.ts');
      console.error('   OR: npx ts-node populate-working.ts -- --token <ACCESS_TOKEN> [options]');
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
