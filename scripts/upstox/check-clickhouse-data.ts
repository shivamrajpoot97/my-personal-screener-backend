#!/usr/bin/env ts-node

import 'dotenv/config';
import { ClickHouseDatabase, SharedDatabase } from '../../shared/database';
import { Stock } from '../../shared/models';
import { logger } from '../../shared/utils/logger';

async function checkClickHouseData() {
  try {
    console.log('\n📊 Checking ClickHouse Data Status...\n');
    
    // Connect to databases
    await SharedDatabase.getInstance().connect('check-data');
    await ClickHouseDatabase.getInstance().connect('check-data');
    
    const db = ClickHouseDatabase.getInstance();
    
    // Get total stocks from MongoDB
    const totalStocks = await Stock.countDocuments({
      instrumentType: 'EQ',
      isActive: true,
      instrumentKey: { $exists: true, $ne: null }
    });
    
    console.log(`📈 Total EQ Stocks in MongoDB: ${totalStocks}`);
    console.log('\n' + '='.repeat(60));
    
    // Check candles by timeframe
    const timeframes = ['15min', '1hour', '1day'];
    
    for (const tf of timeframes) {
      console.log(`\n🕐 Timeframe: ${tf}`);
      console.log('-'.repeat(60));
      
      // Total candles
      const totalCandles = await db.query(
        `SELECT count() as count FROM screener_db.candles WHERE timeframe = '${tf}'`
      );
      
      // Unique symbols with candles
      const uniqueSymbols = await db.query(
        `SELECT count(DISTINCT symbol) as count FROM screener_db.candles WHERE timeframe = '${tf}'`
      );
      
      // Date range
      const dateRange = await db.query(
        `SELECT min(timestamp) as min_date, max(timestamp) as max_date 
         FROM screener_db.candles WHERE timeframe = '${tf}'`
      );
      
      // Symbols with features
      const symbolsWithFeatures = await db.query(
        `SELECT count(DISTINCT symbol) as count FROM screener_db.candle_features WHERE timeframe = '${tf}'`
      );
      
      console.log(`   Total Candles: ${totalCandles[0]?.count || 0}`);
      console.log(`   Unique Symbols: ${uniqueSymbols[0]?.count || 0} / ${totalStocks}`);
      console.log(`   Progress: ${((uniqueSymbols[0]?.count || 0) / totalStocks * 100).toFixed(2)}%`);
      
      if (dateRange[0]?.min_date && dateRange[0]?.max_date) {
        console.log(`   Date Range: ${dateRange[0].min_date} to ${dateRange[0].max_date}`);
      }
      
      console.log(`   Symbols with Features: ${symbolsWithFeatures[0]?.count || 0}`);
      
      // Missing stocks (stocks without candles)
      const stocksWithCandles = await db.query(
        `SELECT DISTINCT symbol FROM screener_db.candles WHERE timeframe = '${tf}'`
      );
      
      const symbolsInClickHouse = new Set(stocksWithCandles.map((s: any) => s.symbol));
      const allStocks = await Stock.find({
        instrumentType: 'EQ',
        isActive: true,
        instrumentKey: { $exists: true, $ne: null }
      }).select('symbol');
      
      const missingCount = allStocks.filter(s => !symbolsInClickHouse.has(s.symbol)).length;
      console.log(`   Missing Stocks: ${missingCount}`);
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Storage info
    const storageInfo = await db.query(
      `SELECT 
        table,
        formatReadableSize(sum(bytes)) as size,
        sum(rows) as rows
      FROM system.parts
      WHERE database = 'screener_db' AND active
      GROUP BY table
      ORDER BY sum(bytes) DESC`
    );
    
    console.log('\n💾 Storage Information:');
    console.log('-'.repeat(60));
    for (const info of storageInfo) {
      console.log(`   ${info.table}: ${info.size} (${info.rows} rows)`);
    }
    
    console.log('\n✅ Data check completed!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Check failed:', error);
    process.exit(1);
  }
}

checkClickHouseData();