#!/usr/bin/env ts-node

import 'dotenv/config';
import { SharedDatabase, ClickHouseDatabase } from '../../shared/database';
import { Stock } from '../../shared/models';  // MongoDB for stocks
import { ClickHouseCandle, ClickHouseCandleFeatures } from '../../shared/models';  // ClickHouse for candles/features
import { logger } from '../../shared/utils/logger';

async function testClickHouse() {
  try {
    console.log('1. Testing database connections...');
    
    // Connect to MongoDB
    await SharedDatabase.getInstance().connect('test-hybrid');
    console.log('✅ Connected to MongoDB');
    
    // Connect to ClickHouse
    const db = ClickHouseDatabase.getInstance();
    await db.connect('test-hybrid');
    console.log('✅ Connected to ClickHouse');
    
    // Test basic query
    console.log('2. Testing basic query...');
    const result = await db.query('SELECT 1 as test');
    console.log('✅ Basic query result:', result);
    
    // Test stock model (MongoDB)
    console.log('3. Testing stock model in MongoDB...');
    
    // Insert or update a test stock in MongoDB
    const testStock = await Stock.findOneAndUpdate(
      { symbol: 'TEST' },
      {
        symbol: 'TEST',
        name: 'Test Stock',
        instrumentKey: 'NSE_EQ|TEST123',
        instrumentType: 'EQ',
        assetType: 'EQT',
        segment: 'EQ',
        exchange: 'NSE',
        price: 100,
        change: 5,
        changePercent: 5.0,
        volume: 1000,
        lotSize: 1,
        tickSize: 0.05,
        isActive: true,
        enableFinancialSync: true,
        financialSyncStatus: 'pending',
        tags: ['test']
      },
      { upsert: true, new: true }
    );
    
    console.log('✅ Test stock upserted in MongoDB');
    
    // Query the stock back from MongoDB
    const stocks = await Stock.find({ symbol: 'TEST' });
    console.log('✅ Found stocks in MongoDB:', stocks.length);
    
    // Test candle model
    console.log('4. Testing candle model...');
    const candleModel = new ClickHouseCandle();
    
    // Insert a test candle
    await candleModel.upsert({
      symbol: 'TEST',
      timeframe: '15min',
      timestamp: new Date(),
      open: 100,
      high: 105,
      low: 98,
      close: 102,
      volume: 5000,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('✅ Test candle inserted');
    
    // Query the candle back
    const candles = await candleModel.find({ symbol: 'TEST', timeframe: '15min' });
    console.log('✅ Found candles:', candles.length);
    if (candles.length > 0) {
      console.log('Sample candle:', {
        symbol: candles[0].symbol,
        price: candles[0].close,
        priceChange: candles[0].priceChange,
        timestamp: candles[0].timestamp
      });
    }
    
    // Test features model
    console.log('5. Testing features model...');
    const featuresModel = new ClickHouseCandleFeatures();
    
    // Insert test features
    await featuresModel.upsert({
      symbol: 'TEST',
      timeframe: '15min',
      timestamp: new Date(),
      candleRef: 'TEST_15min_' + Date.now(),
      sma20: 101.5,
      rsi14: 65.2,
      vwap: 100.8,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('✅ Test features inserted');
    
    // Query features back
    const features = await featuresModel.find({ symbol: 'TEST', timeframe: '15min' });
    console.log('✅ Found features:', features.length);
    
    // Test hybrid database operations
    console.log('6. Testing hybrid database operations...');
    const stockCount = await Stock.countDocuments();
    const candleCount = await candleModel.count();
    
    console.log(`Total stocks (MongoDB): ${stockCount}`);
    console.log(`Total candles (ClickHouse): ${candleCount}`);
    
    console.log('\n🎉 Hybrid MongoDB + ClickHouse setup working!');
    console.log('📊 Stocks stored in MongoDB');
    console.log('📈 Candles & Features stored in ClickHouse');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ ClickHouse test failed:', error);
    process.exit(1);
  }
}

testClickHouse();