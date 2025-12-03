#!/usr/bin/env ts-node

import 'dotenv/config';
import { SharedDatabase } from '../../shared/database';
import { Stock } from '../../shared/models';
import { logger } from '../../shared/utils/logger';

async function checkStocks() {
  try {
    const db = SharedDatabase.getInstance();
    await db.connect('check-stocks');
    
    logger.info('Checking stocks in database...');
    
    // Check all stocks first
    const allStocks = await Stock.find({}).select('symbol instrumentKey name instrumentType exchange').limit(10);
    logger.info(`Found ${allStocks.length} total stocks (showing first 10):`);
    
    allStocks.forEach((stock, index) => {
      logger.info(`${index + 1}. ${stock.symbol} (${stock.instrumentType}):`);
      logger.info(`   - Name: ${stock.name}`);
      logger.info(`   - Exchange: ${stock.exchange}`);
      logger.info(`   - Instrument Key: ${stock.instrumentKey || 'MISSING'}`);
    });
    
    // Get equity stocks with instrument keys
    const equityWithKeys = await Stock.find({
      instrumentType: 'EQ',
      instrumentKey: { $exists: true, $ne: null }
    }).select('symbol instrumentKey name').limit(5);
    
    logger.info(`\nEquity stocks with instrument keys: ${equityWithKeys.length}`);
    equityWithKeys.forEach((stock, index) => {
      logger.info(`${index + 1}. ${stock.symbol}: ${stock.instrumentKey}`);
    });
    
    // Get equity stocks without instrument keys
    const equityWithoutKeys = await Stock.find({
      instrumentType: 'EQ',
      $or: [
        { instrumentKey: { $exists: false } },
        { instrumentKey: null },
        { instrumentKey: '' }
      ]
    }).select('symbol name exchange').limit(5);
    
    logger.info(`\nEquity stocks WITHOUT instrument keys: ${equityWithoutKeys.length}`);
    equityWithoutKeys.forEach((stock, index) => {
      logger.info(`${index + 1}. ${stock.symbol} (${stock.exchange})`);
    });
    
    // Check total counts
    const totalStocks = await Stock.countDocuments();
    const totalEQ = await Stock.countDocuments({ instrumentType: 'EQ' });
    const totalWithKeys = await Stock.countDocuments({ 
      instrumentKey: { $exists: true, $ne: null, $ne: '' } 
    });
    
    logger.info(`\nSummary:`);
    logger.info(`- Total stocks: ${totalStocks}`);
    logger.info(`- Total EQ stocks: ${totalEQ}`);
    logger.info(`- Stocks with instrument keys: ${totalWithKeys}`);
    logger.info(`- EQ stocks needing instrument keys: ${totalEQ - totalWithKeys}`);
    
    process.exit(0);
    
  } catch (error) {
    logger.error('Failed to check stocks:', error);
    process.exit(1);
  }
}

checkStocks();