#!/usr/bin/env ts-node

import 'dotenv/config';
import { SharedDatabase } from '../../shared/database';
import { logger } from '../../shared/utils/logger';
import { Stock } from '../../shared/models';

// Mock stock data with real instrument keys (these are example format)
const MOCK_STOCKS = [
  {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Limited',
    instrumentKey: 'NSE_EQ|INE002A01018',
    exchangeToken: '738561',
    tradingSymbol: 'RELIANCE-EQ'
  },
  {
    symbol: 'TCS',
    name: 'Tata Consultancy Services Limited',
    instrumentKey: 'NSE_EQ|INE467B01029',
    exchangeToken: '2953217',
    tradingSymbol: 'TCS-EQ'
  },
  {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Limited',
    instrumentKey: 'NSE_EQ|INE040A01034',
    exchangeToken: '1333057',
    tradingSymbol: 'HDFCBANK-EQ'
  },
  {
    symbol: 'INFY',
    name: 'Infosys Limited',
    instrumentKey: 'NSE_EQ|INE009A01021',
    exchangeToken: '408065',
    tradingSymbol: 'INFY-EQ'
  },
  {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank Limited',
    instrumentKey: 'NSE_EQ|INE090A01013',
    exchangeToken: '1270529',
    tradingSymbol: 'ICICIBANK-EQ'
  }
];

async function populateMockStocks() {
  try {
    // Connect to database
    const db = SharedDatabase.getInstance();
    await db.connect('mock-stock-populator');
    logger.info('✓ Connected to MongoDB');
    
    // Prepare documents
    const stockDocuments = MOCK_STOCKS.map(mockStock => ({
      symbol: mockStock.symbol,
      name: mockStock.name,
      instrumentKey: mockStock.instrumentKey,
      exchangeToken: mockStock.exchangeToken,
      tradingSymbol: mockStock.tradingSymbol,
      instrumentType: 'EQ' as const,
      assetType: 'EQT' as const,
      segment: 'EQ' as const,
      exchange: 'NSE',
      price: 1000, // Default price
      change: 0,
      changePercent: 0,
      volume: 0,
      lotSize: 1,
      tickSize: 0.05,
      isActive: true,
      enableFinancialSync: true,
      financialSyncStatus: 'pending' as const,
      lastUpdated: new Date(),
      tags: ['mock-data']
    }));

    // Bulk upsert stocks
    logger.info(`Inserting ${stockDocuments.length} mock stocks...`);
    
    const result = await Stock.bulkWrite(
      stockDocuments.map(doc => ({
        updateOne: {
          filter: { 
            symbol: doc.symbol,
            instrumentType: 'EQ',
            exchange: 'NSE'
          },
          update: { $set: doc },
          upsert: true
        }
      }))
    );

    logger.info(`Successfully processed ${stockDocuments.length} mock stocks:`);
    logger.info(`- Inserted: ${result.insertedCount || 0}`);
    logger.info(`- Modified: ${result.modifiedCount || 0}`);
    logger.info(`- Upserted: ${result.upsertedCount || 0}`);
    
    // Verify the data
    const count = await Stock.countDocuments({
      instrumentType: 'EQ',
      instrumentKey: { $exists: true, $ne: null }
    });
    
    logger.info(`Total equity stocks with instrument keys: ${count}`);
    
    logger.info('Mock stock population completed successfully');
    process.exit(0);
    
  } catch (error) {
    logger.error('Mock stock population failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  populateMockStocks();
}

export default populateMockStocks;