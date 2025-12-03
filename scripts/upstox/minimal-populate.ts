#!/usr/bin/env ts-node

import 'dotenv/config';
import axios from 'axios';
import { SharedDatabase } from '../../shared/database';
import { logger } from '../../shared/utils/logger';
import { Stock } from '../../shared/models';

async function minimalPopulate() {
  try {
    console.log('1. Starting minimal populate test...');
    
    const token = process.env.UPSTOX_TOKEN;
    if (!token) {
      console.error('UPSTOX_TOKEN environment variable not set');
      process.exit(1);
    }
    
    console.log('2. Connecting to database...');
    const db = SharedDatabase.getInstance();
    await db.connect('minimal-populate');
    console.log('3. ✓ Connected to MongoDB');
    
    console.log('4. Getting equity stocks...');
    const equityStocks = await Stock.find({
      instrumentType: 'EQ',
      isActive: true,
      instrumentKey: { $exists: true, $ne: null }
    }).select('symbol instrumentKey name').limit(2); // Only 2 for testing
    
    console.log(`5. Found ${equityStocks.length} equity stocks`);
    
    if (equityStocks.length === 0) {
      console.log('No equity stocks found, exiting');
      process.exit(0);
    }
    
    // Test API call with first stock
    const stock = equityStocks[0]!;
    console.log(`6. Testing API with ${stock.symbol} (${stock.instrumentKey})`);
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    
    const toStr = toDate.toISOString().split('T')[0];
    const fromStr = fromDate.toISOString().split('T')[0];
    
    const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(stock.instrumentKey!!)}/minutes/15/${toStr}/${fromStr}`;
    console.log(`7. Testing URL: ${url}`);
    
    const response = await axios.get(url, { headers });
    console.log(`8. API Response status: ${response.data.status}`);
    
    if (response.data.status === 'success') {
      const candles = response.data.data?.candles || [];
      console.log(`9. ✓ Got ${candles.length} candles`);
      
      if (candles.length > 0) {
        console.log('Sample candle:', candles[0]);
      }
    } else {
      console.log('9. ✗ API call failed:', response.data);
    }
    
    console.log('10. Test completed successfully');
    process.exit(0);
    
  } catch (error: any) {
    console.error('Test failed:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    process.exit(1);
  }
}

minimalPopulate();