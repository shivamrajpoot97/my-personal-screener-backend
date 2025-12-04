#!/usr/bin/env ts-node

import 'dotenv/config';
import axios from 'axios';
import { SharedDatabase } from '../../shared/database';
import { logger } from '../../shared/utils/logger';
import { Stock, Candle } from '../../shared/models';
import { CandleFeatures } from '../../shared/models';

import { FEATURE_KEYS, TIMEFRAME_FEATURES } from '../../shared/models/CandleFeatures';

interface TimeframeConfig {
  name: string;
  interval: string;
  mongoTimeframe: string;
  fromDate: string;
  toDate: string;
  description: string;
}

// Technical indicator computation functions
function computeSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const sum = values.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

function computeEMA(values: number[], period: number, prevEMA?: number): number | null {
  if (values.length === 0) return null;
  const currentPrice = values[values.length - 1]!;
  if (prevEMA === undefined) {
    // First EMA calculation uses SMA
    return computeSMA(values, period);
  }
  const multiplier = 2 / (period + 1);
  return (currentPrice * multiplier) + (prevEMA * (1 - multiplier));
}

function computeRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i]! - prices[i - 1]!;
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function computeATR(candles: any[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;
  
  let trSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const current = candles[i]!;
    const prev = candles[i - 1];
    
    const tr1 = current.high - current.low;
    const tr2 = prev ? Math.abs(current.high - prev.close) : 0;
    const tr3 = prev ? Math.abs(current.low - prev.close) : 0;
    
    trSum += Math.max(tr1, tr2, tr3);
  }
  
  return trSum / period;
}

function computeVWAP(candles: any[]): number | null {
  if (candles.length === 0) return null;
  
  let volumeSum = 0;
  let volumePriceSum = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    volumePriceSum += typicalPrice * candle.volume;
    volumeSum += candle.volume;
  }
  
  return volumeSum > 0 ? volumePriceSum / volumeSum : null;
}

function computeFeaturesForTimeframe(
  candles: any[],
  currentIndex: number,
  timeframe: keyof typeof TIMEFRAME_FEATURES
): Record<string, any> {
  const features: Record<string, any> = {};
  const currentCandle = candles[currentIndex]!;
  const requiredFeatures = TIMEFRAME_FEATURES[timeframe];
  
  // Get sufficient historical data for calculations
  const startIndex = Math.max(0, currentIndex - 250); // Use up to 250 previous candles
  const closePrices = candles.slice(startIndex, currentIndex + 1).map(c => c.close);
  const volumes = candles.slice(startIndex, currentIndex + 1).map(c => c.volume);
  const candleHistory = candles.slice(startIndex, currentIndex + 1);
  
  logger.debug(`Computing features for candle ${currentIndex + 1}/${candles.length}, using ${closePrices.length} historical points`);
  
  for (const featureKey of requiredFeatures) {
    switch (featureKey) {
      case 's5':
        features[featureKey] = computeSMA(closePrices, 5);
        break;
      case 's10':
        features[featureKey] = computeSMA(closePrices, 10);
        break;
      case 's20':
        features[featureKey] = computeSMA(closePrices, 20);
        break;
      case 's50':
        features[featureKey] = computeSMA(closePrices, 50);
        break;
      case 's200':
        features[featureKey] = computeSMA(closePrices, 200);
        break;
      case 'e21':
        features[featureKey] = computeEMA(closePrices, 21);
        break;
      case 'r':
      case 'r14':
        features[featureKey] = computeRSI(closePrices, 14);
        break;
      case 'atr':
        features[featureKey] = computeATR(candleHistory, 14);
        break;
      case 'vw':
        features[featureKey] = computeVWAP(candleHistory.slice(-20)); // Last 20 periods
        break;
      case 'vs':
        features[featureKey] = computeSMA(volumes, 10);
        break;
      case 'vr':
        const avgVolume = computeSMA(volumes, 20);
        features[featureKey] = avgVolume ? currentCandle.volume / avgVolume : null;
        break;
      case 'cp':
        // Simple pattern recognition
        const bodySize = Math.abs(currentCandle.close - currentCandle.open);
        const range = currentCandle.high - currentCandle.low;
        if (range > 0) {
          if (bodySize <= range * 0.1) features[featureKey] = 'doji';
          else if (currentCandle.close > currentCandle.open) features[featureKey] = 'bullish';
          else features[featureKey] = 'bearish';
        }
        break;
      case 'rs':
        // Relative strength vs market (simplified)
        features[featureKey] = computeRSI(closePrices, 20);
        break;
      case 'pp':
        // Price position within range
        const sma20 = computeSMA(closePrices, 20);
        features[featureKey] = sma20 ? ((currentCandle.close - sma20) / sma20) * 100 : null;
        break;
      default:
        // For other indicators, set placeholder values
        features[featureKey] = null;
    }
  }
  
  return features;
}

async function populateAllStocksWithFeatures() {
  try {
    const token = process.argv[2];
    
    if (!token) {
      console.error('Usage: npx ts-node populate-all-stocks-with-features.ts <ACCESS_TOKEN> [BATCH_SIZE] [STOCK_DELAY]');
      console.error('Arguments:');
      console.error('  ACCESS_TOKEN  - Fresh Upstox API access token (required)');
      console.error('  BATCH_SIZE    - Stocks to process simultaneously (default: 5)');
      console.error('  STOCK_DELAY   - Milliseconds between stocks (default: 1000)');
      console.error('');
      console.error('Example: npx ts-node populate-all-stocks-with-features.ts "eyJ0eXA..." 3 2000');
      process.exit(1);
    }

    // Connect to database
    const db = SharedDatabase.getInstance();
    await db.connect('test-and-save-single-stock');
    logger.info('✓ Connected to MongoDB');
    
    // Get all EQ stocks
    const stocks = await Stock.find({
      instrumentType: 'EQ',
      isActive: true,
      instrumentKey: { $exists: true, $ne: null }
    }).select('symbol instrumentKey name');
    
    if (stocks.length === 0) {
      logger.error('No EQ stocks found with instrument keys');
      process.exit(1);
    }
    
    logger.info(`Found ${stocks.length} EQ stocks to populate`);
    logger.info(`This will process all stocks with historical data and features`);
    
    // Calculate date ranges
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // 15min: Last 30 days (yesterday to 30 days back)
    const min15FromDate = new Date(yesterday);
    min15FromDate.setDate(min15FromDate.getDate() - 30);
    
    // 1hour: Need to break into 2 parts due to API limits (3 months max per call)
    // Part 1: 3 months (30 days ago to 3 months back)
    const hour1Part1FromDate = new Date(min15FromDate);
    hour1Part1FromDate.setMonth(hour1Part1FromDate.getMonth() - 3);
    
    // Part 2: 2 more months (3 months ago to 5 months back)
    const hour1Part2FromDate = new Date(hour1Part1FromDate);
    hour1Part2FromDate.setMonth(hour1Part2FromDate.getMonth() - 2);
    
    // Daily: Remaining 3 years (5 months ago to 3 years back)
    const dailyFromDate = new Date(hour1Part2FromDate);
    dailyFromDate.setFullYear(dailyFromDate.getFullYear() - 3);
    
    const timeframes: TimeframeConfig[] = [
      {
        name: '15min',
        interval: 'minutes/15',
        mongoTimeframe: '15min',
        fromDate: min15FromDate.toISOString().split('T')[0],
        toDate: yesterday.toISOString().split('T')[0],
        description: 'Last 30 days - 15 minute candles'
      },
      {
        name: '1hour-part1',
        interval: 'hours/1',
        mongoTimeframe: '1hour',
        fromDate: hour1Part1FromDate.toISOString().split('T')[0],
        toDate: min15FromDate.toISOString().split('T')[0],
        description: 'First 3 months - 1 hour candles (API limit: max 3 months per call)'
      },
      {
        name: '1hour-part2',
        interval: 'hours/1',
        mongoTimeframe: '1hour',
        fromDate: hour1Part2FromDate.toISOString().split('T')[0],
        toDate: hour1Part1FromDate.toISOString().split('T')[0],
        description: 'Next 2 months - 1 hour candles (completing 5 months total)'
      },
      {
        name: 'daily',
        interval: 'days/1',
        mongoTimeframe: '1day',
        fromDate: dailyFromDate.toISOString().split('T')[0],
        toDate: hour1Part2FromDate.toISOString().split('T')[0],
        description: 'Remaining 3 years - Daily candles'
      }
    ];
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    let totalSuccess = 0;
    let totalCandles = 0;
    let totalSaved = 0;
    let totalFeaturesSaved = 0;
    let hour1TotalCandles = 0;
    let stocksProcessed = 0;
    let stocksSuccessful = 0;
    let stocksFailed = 0;
    
    const batchSize = parseInt(process.argv[3]) || 5; // Configurable batch size
    const stockDelay = parseInt(process.argv[4]) || 1000; // Delay between stocks
    
    logger.info(`Processing ${stocks.length} stocks in batches of ${batchSize}`);
    logger.info(`Delay between stocks: ${stockDelay}ms`);
    
    // Process all stocks
    for (let stockIndex = 0; stockIndex < stocks.length; stockIndex++) {
      const stock = stocks[stockIndex]!;
      stocksProcessed++;
      
      logger.info(`\n=== Stock ${stockIndex + 1}/${stocks.length}: ${stock.symbol} ===`);
      logger.info(`Name: ${stock.name}`);
      logger.info(`Instrument Key: ${stock.instrumentKey}`);
      
      let stockSuccess = true;
      let stockCandles = 0;
      let stockFeatures = 0;
      
      try {
        // Process each timeframe for this stock
        for (const timeframe of timeframes) {
      try {
        logger.info(`\n=== Processing ${timeframe.name.toUpperCase()} ===`);
        logger.info(`Description: ${timeframe.description}`);
        logger.info(`Date range: ${timeframe.fromDate} to ${timeframe.toDate}`);
        
        const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(stock.instrumentKey!)}/${timeframe.interval}/${timeframe.toDate}/${timeframe.fromDate}`;
        logger.info(`URL: ${url}`);
        
        const response = await axios.get(url, { headers });
        logger.info(`Response status: ${response.data.status}`);
        
        if (response.data.status === 'success' && response.data.data?.candles) {
          const candleCount = response.data.data.candles.length;
          logger.info(`✅ Fetched ${candleCount} ${timeframe.name} candles`);
          
          if (candleCount > 0) {
            // Parse and prepare candles with computed features
            const candleDocuments = response.data.data.candles.map((candleArray: number[]) => {
              const open = candleArray[1]!;
              const high = candleArray[2]!;
              const low = candleArray[3]!;
              const close = candleArray[4]!;
              const volume = candleArray[5]!;
              
              // Compute basic features
              const priceChange = close - open;
              const priceChangePercent = open !== 0 ? (priceChange / open) * 100 : 0;
              const range = high - low;
              const bodySize = Math.abs(close - open);
              const upperShadow = high - Math.max(open, close);
              const lowerShadow = Math.min(open, close) - low;
              const isGreen = close > open;
              const isDoji = bodySize <= (range * 0.1); // Body is <= 10% of range
              const isHammer = lowerShadow >= (bodySize * 2) && upperShadow <= (bodySize * 0.5);
              const isShooting = upperShadow >= (bodySize * 2) && lowerShadow <= (bodySize * 0.5);
              
              return {
                symbol: stock.symbol.toUpperCase(),
                timeframe: timeframe.mongoTimeframe,
                timestamp: new Date(candleArray[0]!),
                open,
                high,
                low,
                close,
                volume,
                openInterest: candleArray[6] || undefined,
                
                // Computed features
                priceChange,
                priceChangePercent,
                range,
                bodySize,
                upperShadow,
                lowerShadow,
                
                // Pattern recognition
                isGreen,
                isDoji,
                isHammer,
                isShooting,
                
                // Metadata
                createdAt: new Date(),
                updatedAt: new Date()
              };
            });
            
            // Check database connection before saving
            if (!db.getConnectionStatus()) {
              logger.warn('Database connection lost, attempting to reconnect...');
              await db.connect('populate-all-stocks-reconnect');
            }
            
            // Save candles to database with upsert (update if exists, insert if not)
            try {
              const candleResult = await Candle.bulkWrite(
                candleDocuments.map(doc => ({
                  updateOne: {
                    filter: { 
                      symbol: doc.symbol,
                      timeframe: doc.timeframe,
                      timestamp: doc.timestamp
                    },
                    update: { $set: doc },
                    upsert: true
                  }
                }))
              );
              
              const candlesSaved = candleResult.upsertedCount + candleResult.modifiedCount;
              logger.info(`💾 Saved ${candlesSaved} ${timeframe.name} candles to database`);
              
              // Now compute and save technical features
              let featuresSaved = 0;
              const timeframeKey = timeframe.mongoTimeframe as keyof typeof TIMEFRAME_FEATURES;
              
              if (TIMEFRAME_FEATURES[timeframeKey]) {
                logger.info(`📊 Computing technical features for ${timeframe.name}...`);
                
                // Get ALL historical candles for this symbol and timeframe for proper feature computation
                const allHistoricalCandles = await Candle.find({
                  symbol: stock.symbol,
                  timeframe: timeframe.mongoTimeframe
                }).sort({ timestamp: 1 }); // Get ALL candles, sorted chronologically
                
                logger.info(`📊 Found ${allHistoricalCandles.length} total historical candles for feature computation`);
                if (allHistoricalCandles.length > 0) {
                  logger.info(`📅 Date range: ${allHistoricalCandles[0]?.timestamp.toISOString().split('T')[0]} to ${allHistoricalCandles[allHistoricalCandles.length - 1]?.timestamp.toISOString().split('T')[0]}`);
                }
                
                // Get only the current batch for feature saving
                const currentBatchCandles = await Candle.find({
                  symbol: stock.symbol,
                  timeframe: timeframe.mongoTimeframe,
                  timestamp: {
                    $gte: new Date(timeframe.fromDate),
                    $lte: new Date(timeframe.toDate)
                  }
                }).sort({ timestamp: 1 });
                
                // Compute features for current batch using full historical context
                const featureDocuments = [];
                let featuresComputed = 0;
                
                for (const candle of currentBatchCandles) {
                  // Find the position of this candle in the full historical dataset
                  const historicalIndex = allHistoricalCandles.findIndex(
                    c => c.timestamp.getTime() === candle.timestamp.getTime()
                  );
                  
                  if (historicalIndex >= 0) {
                    const features = computeFeaturesForTimeframe(allHistoricalCandles, historicalIndex, timeframeKey);
                    
                    // Count non-null features
                    const nonNullFeatures = Object.values(features).filter(v => v !== null && v !== undefined).length;
                    
                    featureDocuments.push({
                      candleId: candle._id,
                      symbol: stock.symbol.toUpperCase(),
                      timeframe: timeframeKey,
                      timestamp: candle.timestamp,
                      f: features
                    });
                    
                    if (nonNullFeatures > 0) {
                      featuresComputed++;
                    }
                    
                    if (featuresComputed <= 3) { // Log first few for debugging
                      logger.debug(`Sample features for ${candle.timestamp.toISOString()}: ${JSON.stringify(features)}`);
                    }
                  }
                }
                
                logger.info(`📈 Computed features for ${featureDocuments.length} candles (${featuresComputed} with non-null features)`);
                
                if (featureDocuments.length > 0) {
                  try {
                    const featureResult = await CandleFeatures.bulkWrite(
                      featureDocuments.map(doc => ({
                        updateOne: {
                          filter: { candleId: doc.candleId },
                          update: { $set: doc },
                          upsert: true
                        }
                      }))
                    );
                    
                    featuresSaved = featureResult.upsertedCount + featureResult.modifiedCount;
                    logger.info(`📈 Saved ${featuresSaved} technical feature sets`);
                    logger.info(`🎯 Features: ${TIMEFRAME_FEATURES[timeframeKey].join(', ')}`);
                    
                  } catch (featureError: any) {
                    logger.error(`❌ Failed to save features:`);
                    logger.error(`Error: ${featureError.message}`);
                    if (featureError.writeErrors && featureError.writeErrors.length > 0) {
                      logger.error('Feature write errors:', featureError.writeErrors.slice(0, 3));
                    }
                    if (featureError.code) {
                      logger.error(`Feature error code: ${featureError.code}`);
                    }
                  }
                }
              }
              
              totalSaved += candlesSaved;
              totalFeaturesSaved += featuresSaved;
              stockCandles += candlesSaved;
              stockFeatures += featuresSaved;
              logger.info(`✅ Total saved: ${candlesSaved} candles + ${featuresSaved} feature sets`);
              
              // Show sample candles
              logger.info('Sample candle (first):', response.data.data.candles[0]);
              if (candleCount > 1) {
                logger.info('Sample candle (last):', response.data.data.candles[candleCount - 1]);
              }
              
            } catch (saveError: any) {
              logger.error(`❌ Failed to save ${timeframe.name} candles:`);
              logger.error(`Error: ${saveError.message}`);
              if (saveError.writeErrors && saveError.writeErrors.length > 0) {
                logger.error('Write errors:', saveError.writeErrors.slice(0, 3));
              }
              if (saveError.code) {
                logger.error(`Error code: ${saveError.code}`);
              }
              logger.error('Stack:', saveError.stack?.split('\n')[0]);
            }
          }
          
          totalSuccess++;
          totalCandles += candleCount;
          
          // Track 1hour candles separately
          if (timeframe.name.startsWith('1hour')) {
            hour1TotalCandles += candleCount;
          }
        } else {
          logger.error(`❌ No candle data received for ${timeframe.name}:`, response.data);
          stockSuccess = false;
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error: any) {
        logger.error(`❌ ${timeframe.name} failed for ${stock.symbol}:`, {
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
          data: error.response?.data
        });
        stockSuccess = false;
      }
    }
    
    // Stock completion summary
    if (stockSuccess) {
      stocksSuccessful++;
      logger.info(`✅ ${stock.symbol} completed: ${stockCandles} candles + ${stockFeatures} features`);
    } else {
      stocksFailed++;
      logger.error(`❌ ${stock.symbol} failed or incomplete`);
    }
    
    // Progress update
    const progressPercent = ((stockIndex + 1) / stocks.length * 100).toFixed(1);
    logger.info(`📊 Progress: ${stockIndex + 1}/${stocks.length} (${progressPercent}%) | Success: ${stocksSuccessful} | Failed: ${stocksFailed}`);
    
  } catch (stockError: any) {
    logger.error(`❌ Critical error processing ${stock.symbol}:`, stockError.message);
    stocksFailed++;
  }
  
  // Delay between stocks (respect API limits)
  if (stockIndex < stocks.length - 1) {
    logger.info(`⏳ Waiting ${stockDelay}ms before next stock...`);
    await new Promise(resolve => setTimeout(resolve, stockDelay));
  }
}
    
    // Check what's actually in database (all stocks)
    logger.info('\n📊 Calculating final database statistics...');
    const dbCounts = {
      candles: {
        '15min': await Candle.countDocuments({ timeframe: '15min' }),
        '1hour': await Candle.countDocuments({ timeframe: '1hour' }),
        '1day': await Candle.countDocuments({ timeframe: '1day' })
      },
      features: {
        '15min': await CandleFeatures.countDocuments({ timeframe: '15min' }),
        '1hour': await CandleFeatures.countDocuments({ timeframe: '1hour' }),
        '1day': await CandleFeatures.countDocuments({ timeframe: '1day' })
      }
    };
    
    // Count unique stocks with data
    const stocksWithCandles = await Candle.distinct('symbol');
    const stocksWithFeatures = await CandleFeatures.distinct('symbol');
    
    logger.info(`\n=== FINAL SUMMARY ===`);
    logger.info(`📈 Stocks Processed: ${stocksProcessed}`);
    logger.info(`✅ Stocks Successful: ${stocksSuccessful}`);
    logger.info(`❌ Stocks Failed: ${stocksFailed}`);
    logger.info(`📊 Success Rate: ${((stocksSuccessful / stocksProcessed) * 100).toFixed(1)}%`);
    logger.info(``);
    logger.info(`📊 Total API calls: ${totalSuccess}`);
    logger.info(`📊 Total candles fetched: ${totalCandles}`);
    logger.info(`💾 Total candles saved: ${totalSaved}`);
    logger.info(`🔢 Total features saved: ${totalFeaturesSaved}`);
    logger.info(`⏱️  1hour candles (both parts): ${hour1TotalCandles}`);
    
    logger.info('\n💾 DATABASE VERIFICATION:');
    logger.info('📊 Unique Stocks:');
    logger.info(`- Stocks with candles: ${stocksWithCandles.length}`);
    logger.info(`- Stocks with features: ${stocksWithFeatures.length}`);
    
    logger.info('\n📊 Candles by Timeframe:');
    logger.info(`- 15min candles: ${dbCounts.candles['15min']}`);
    logger.info(`- 1hour candles: ${dbCounts.candles['1hour']}`);
    logger.info(`- Daily candles: ${dbCounts.candles['1day']}`);
    logger.info(`- Total candles: ${dbCounts.candles['15min'] + dbCounts.candles['1hour'] + dbCounts.candles['1day']}`);
    
    logger.info('\n🔢 Technical Features:');
    logger.info(`- 15min features: ${dbCounts.features['15min']} (${TIMEFRAME_FEATURES['15min'].length} indicators each)`);
    logger.info(`- 1hour features: ${dbCounts.features['1hour']} (${TIMEFRAME_FEATURES['1hour'].length} indicators each)`);
    logger.info(`- Daily features: ${dbCounts.features['1day']} (${TIMEFRAME_FEATURES['1day'].length} indicators each)`);
    logger.info(`- Total feature sets: ${dbCounts.features['15min'] + dbCounts.features['1hour'] + dbCounts.features['1day']}`);
    
    // Calculate storage estimates
    const totalRecords = (dbCounts.candles['15min'] + dbCounts.candles['1hour'] + dbCounts.candles['1day']) + 
                        (dbCounts.features['15min'] + dbCounts.features['1hour'] + dbCounts.features['1day']);
    logger.info(`\n📦 Total Records: ${totalRecords.toLocaleString()}`);
    logger.info(`📦 Estimated Storage: ~${(totalRecords * 0.5 / 1024).toFixed(1)} MB`);
    
    logger.info('\nTimeframe Strategy with API Limits:');
    logger.info('- 15min: Last 30 days (single call)');
    logger.info('- 1hour: 5 months total, split into 2 calls (3 months + 2 months)');
    logger.info('- Daily: Remaining 3 years (single call)');
    
    if (stocksSuccessful > 0 && totalSaved > 0) {
      logger.info('\n🎉 Population completed successfully!');
      logger.info(`✅ Successfully processed ${stocksSuccessful}/${stocksProcessed} stocks`);
      logger.info(`💾 Saved ${totalSaved} candles and ${totalFeaturesSaved} feature sets`);
      
      if (stocksSuccessful === stocksProcessed) {
        logger.info('🌟 Perfect run! All stocks processed successfully!');
      } else if (stocksSuccessful / stocksProcessed >= 0.8) {
        logger.info('✅ Good run! 80%+ success rate achieved.');
      } else {
        logger.warn('⚠️  Partial success. Consider checking failed stocks.');
      }
    } else {
      logger.error(`❌ Population failed. Successful: ${stocksSuccessful}, Saved: ${totalSaved}`);
      process.exit(1);
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

populateAllStocksWithFeatures();