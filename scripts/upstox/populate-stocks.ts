#!/usr/bin/env ts-node

import 'dotenv/config';
import axios from 'axios';
import { SharedDatabase } from '../../shared/database';
import { logger } from '../../shared/utils/logger';
import { Stock } from '../../shared/models';

interface UpstoxInstrument {
  instrument_key: string;
  exchange_token: string;
  tradingsymbol: string;
  name: string;
  last_price: number;
  expiry: string;
  strike: number;
  tick_size: number;
  lot_size: number;
  instrument_type: string;
  segment: string;
  exchange: string;
}

class StockPopulator {
  private accessToken: string;
  private baseUrl = 'https://api.upstox.com/v3';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/json'
    };
  }

  async fetchInstrumentMaster(): Promise<UpstoxInstrument[]> {
    try {
      logger.info('Fetching instrument master from Upstox...');
      
      const response = await axios.get(`${this.baseUrl}/instruments`, {
        headers: this.getHeaders()
      });

      if (response.data.status === 'success' && response.data.data) {
        logger.info(`Fetched ${response.data.data.length} instruments`);
        return response.data.data;
      }
      
      throw new Error(`API Error: ${response.data.status || 'Unknown error'}`);
    } catch (error: any) {
      logger.error('Failed to fetch instrument master:', error.response?.data || error.message);
      throw error;
    }
  }

  async populateEquityStocks(): Promise<void> {
    try {
      const instruments = await this.fetchInstrumentMaster();
      
      // Filter for equity stocks only
      const equityInstruments = instruments.filter(inst => 
        inst.instrument_type === 'EQ' && 
        inst.segment === 'NSE_EQ'
      );
      
      logger.info(`Found ${equityInstruments.length} equity instruments`);
      
      if (equityInstruments.length === 0) {
        logger.warn('No equity instruments found');
        return;
      }

      // Prepare documents for bulk insert
      const stockDocuments = equityInstruments.map(inst => {
        // Extract symbol from trading symbol (remove any suffixes like -EQ)
        const symbol = inst.tradingsymbol.replace(/-EQ$/, '').toUpperCase();
        
        return {
          symbol: symbol,
          name: inst.name || symbol,
          instrumentKey: inst.instrument_key,
          exchangeToken: inst.exchange_token,
          tradingSymbol: inst.tradingsymbol,
          instrumentType: 'EQ' as const,
          assetType: 'EQT' as const,
          segment: 'EQ' as const,
          exchange: 'NSE',
          price: inst.last_price || 0,
          change: 0,
          changePercent: 0,
          volume: 0,
          lotSize: inst.lot_size || 1,
          tickSize: inst.tick_size || 0.05,
          isActive: true,
          enableFinancialSync: true,
          financialSyncStatus: 'pending' as const,
          lastUpdated: new Date(),
          tags: ['upstox-imported']
        };
      });

      // Bulk upsert stocks
      logger.info(`Upserting ${stockDocuments.length} equity stocks...`);
      
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

      logger.info(`Successfully processed ${stockDocuments.length} stocks:`);
      logger.info(`- Inserted: ${result.insertedCount || 0}`);
      logger.info(`- Modified: ${result.modifiedCount || 0}`);
      logger.info(`- Upserted: ${result.upsertedCount || 0}`);
      
    } catch (error) {
      logger.error('Failed to populate equity stocks:', error);
      throw error;
    }
  }

  async testConnection(): Promise<void> {
    try {
      const response = await axios.get(`${this.baseUrl}/user/profile`, {
        headers: this.getHeaders()
      });
      
      if (response.data.status === 'success') {
        logger.info('✓ Upstox connection successful');
        logger.info(`User: ${response.data.data.user_name}`);
      } else {
        throw new Error(`Connection failed: ${response.data.status}`);
      }
    } catch (error: any) {
      logger.error('Connection test failed:', error.response?.data || error.message);
      throw error;
    }
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    let accessToken = '';
    
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i];
      const value = args[i + 1];
      
      if (flag === '--token') {
        accessToken = value!;
        break;
      }
    }
    
    if (!accessToken) {
      console.error('Usage: npx ts-node populate-stocks.ts --token <ACCESS_TOKEN>');
      process.exit(1);
    }
    
    // Connect to database
    const db = SharedDatabase.getInstance();
    await db.connect('stock-populator');
    logger.info('✓ Connected to MongoDB');
    
    const populator = new StockPopulator(accessToken);
    
    // Test connection first
    await populator.testConnection();
    
    // Populate stocks
    await populator.populateEquityStocks();
    
    logger.info('Stock population completed successfully');
    process.exit(0);
    
  } catch (error) {
    logger.error('Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default StockPopulator;