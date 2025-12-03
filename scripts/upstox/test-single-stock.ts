#!/usr/bin/env ts-node

import 'dotenv/config';
import axios from 'axios';
import { SharedDatabase } from '../../shared/database';
import { logger } from '../../shared/utils/logger';
import { Stock } from '../../shared/models';

async function testSingleStock() {
  try {
    const token = process.argv[2];
    
    if (!token) {
      console.error('Usage: npx ts-node test-single-stock.ts <ACCESS_TOKEN>');
      process.exit(1);
    }

    // Connect to database
    const db = SharedDatabase.getInstance();
    await db.connect('test-single-stock');
    logger.info('✓ Connected to MongoDB');
    
    // Get one EQ stock
    const stock = await Stock.findOne({
      instrumentType: 'EQ',
      isActive: true,
      instrumentKey: { $exists: true, $ne: null }
    });
    
    if (!stock) {
      logger.error('No EQ stock found with instrument key');
      process.exit(1);
    }
    
    logger.info(`Testing with stock: ${stock.symbol}`);
    logger.info(`Instrument Key: ${stock.instrumentKey}`);
    logger.info(`Name: ${stock.name}`);
    
    // Test API call
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    const toDate = '2025-01-02';
    const fromDate = '2025-01-01';
    const interval = 'minutes/15';
    
    const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(stock.instrumentKey!)}/${interval}/${toDate}/${fromDate}`;
    logger.info(`Testing URL: ${url}`);
    
    const response = await axios.get(url, { headers });
    logger.info(`Response status: ${response.data.status}`);
    
    if (response.data.status === 'success' && response.data.data?.candles) {
      logger.info(`✓ Success! Got ${response.data.data.candles.length} candles`);
      logger.info('Sample candle:', response.data.data.candles[0]);
    } else {
      logger.error('No candle data received:', response.data);
    }
    
    process.exit(0);
    
  } catch (error: any) {
    logger.error('Test failed:', {
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      data: error.response?.data
    });
    process.exit(1);
  }
}

testSingleStock();