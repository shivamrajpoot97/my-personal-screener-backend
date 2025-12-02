import { ICandleData, ICandleFeaturesData } from '@shared/models';
import { logger } from '@shared/utils/logger';
import CandleService, { CandleWithFeatures } from './CandleService';

export interface ConversionResult {
  convertedCandle: ICandleData;
  convertedFeatures?: Partial<ICandleFeaturesData>;
  originalCount: number;
}

export class CandleConverterService {
  
  /**
   * Convert 15min candles to 1hour candles
   */
  async convert15minTo1hour(
    symbol: string, 
    date: Date
  ): Promise<ConversionResult[]> {
    try {
      // Get all 15min candles for the day
      const candles = await CandleService.getCandlesForConversion(symbol, '15min', date);
      
      if (candles.length === 0) {
        logger.info(`No 15min candles found for ${symbol} on ${date.toDateString()}`);
        return [];
      }
      
      // Group candles by hour
      const hourlyGroups = this.groupCandlesByHour(candles);
      const results: ConversionResult[] = [];
      
      for (const [hour, hourCandles] of hourlyGroups.entries()) {
        if (hourCandles.length === 0) continue;
        
        const convertedCandle = this.aggregateCandles(hourCandles, '1hour');
        const convertedFeatures = this.aggregateFeatures(hourCandles);
        
        results.push({
          convertedCandle,
          convertedFeatures,
          originalCount: hourCandles.length
        });
      }
      
      logger.info(`Converted ${candles.length} 15min candles to ${results.length} 1hour candles for ${symbol}`);
      return results;
      
    } catch (error) {
      logger.error(`Error converting 15min to 1hour for ${symbol}:`, error);
      throw error;
    }
  }
  
  /**
   * Convert 1hour candles to 1day candles
   */
  async convert1hourTo1day(
    symbol: string, 
    date: Date
  ): Promise<ConversionResult[]> {
    try {
      // Get all 1hour candles for the day
      const candles = await CandleService.getCandlesForConversion(symbol, '1hour', date);
      
      if (candles.length === 0) {
        logger.info(`No 1hour candles found for ${symbol} on ${date.toDateString()}`);
        return [];
      }
      
      // Aggregate all candles for the day into one daily candle
      const convertedCandle = this.aggregateCandles(candles, '1day');
      const convertedFeatures = this.aggregateFeatures(candles);
      
      // Set timestamp to start of day
      convertedCandle.timestamp = new Date(date);
      convertedCandle.timestamp.setHours(0, 0, 0, 0);
      
      logger.info(`Converted ${candles.length} 1hour candles to 1 daily candle for ${symbol}`);
      
      return [{
        convertedCandle,
        convertedFeatures,
        originalCount: candles.length
      }];
      
    } catch (error) {
      logger.error(`Error converting 1hour to 1day for ${symbol}:`, error);
      throw error;
    }
  }
  
  /**
   * Process conversion for a specific date
   */
  async processConversion(
    symbol: string,
    fromTimeframe: '15min' | '1hour',
    toTimeframe: '1hour' | '1day',
    date: Date
  ): Promise<void> {
    try {
      let conversionResults: ConversionResult[];
      
      // Get conversion results
      if (fromTimeframe === '15min' && toTimeframe === '1hour') {
        conversionResults = await this.convert15minTo1hour(symbol, date);
      } else if (fromTimeframe === '1hour' && toTimeframe === '1day') {
        conversionResults = await this.convert1hourTo1day(symbol, date);
      } else {
        throw new Error(`Invalid conversion: ${fromTimeframe} to ${toTimeframe}`);
      }
      
      if (conversionResults.length === 0) {
        return;
      }
      
      // Get original candles for backup
      const originalCandles = await CandleService.getCandlesForConversion(symbol, fromTimeframe, date);
      
      // Store backup
      await CandleService.storeBackup(
        symbol,
        fromTimeframe,
        toTimeframe,
        date,
        originalCandles.map(c => ({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          openInterest: c.openInterest
        })),
        originalCandles.map(c => c.features).filter(Boolean)
      );
      
      // Store converted candles
      const candlesData = conversionResults.map(r => r.convertedCandle);
      const featuresData = conversionResults
        .map(r => r.convertedFeatures)
        .filter(Boolean) as Partial<ICandleFeaturesData>[];
      
      await CandleService.storeCandlesBatch(candlesData, featuresData);
      
      // Delete original candles
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      
      await CandleService.deleteCandles({
        symbol,
        timeframe: fromTimeframe,
        before: dayEnd
      });
      
      logger.info(`Successfully processed conversion for ${symbol} from ${fromTimeframe} to ${toTimeframe} on ${date.toDateString()}`);
      
    } catch (error) {
      logger.error(`Error processing conversion for ${symbol}:`, error);
      throw error;
    }
  }
  
  /**
   * Group candles by hour
   */
  private groupCandlesByHour(candles: CandleWithFeatures[]): Map<number, CandleWithFeatures[]> {
    const groups = new Map<number, CandleWithFeatures[]>();
    
    for (const candle of candles) {
      const hour = new Date(candle.timestamp).getHours();
      if (!groups.has(hour)) {
        groups.set(hour, []);
      }
      groups.get(hour)!.push(candle);
    }
    
    return groups;
  }
  
  /**
   * Aggregate multiple candles into one
   */
  private aggregateCandles(candles: CandleWithFeatures[], targetTimeframe: string): ICandleData {
    if (candles.length === 0) {
      throw new Error('Cannot aggregate empty candles array');
    }
    
    // Sort by timestamp
    candles.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    const first = candles[0];
    const last = candles[candles.length - 1];
    
    const high = Math.max(...candles.map(c => c.high));
    const low = Math.min(...candles.map(c => c.low));
    const volume = candles.reduce((sum, c) => sum + c.volume, 0);
    const openInterest = candles.reduce((sum, c) => sum + (c.openInterest || 0), 0);
    
    const aggregated: ICandleData = {
      symbol: first.symbol,
      timeframe: targetTimeframe,
      timestamp: first.timestamp, // Will be adjusted by caller if needed
      open: first.open,
      high,
      low,
      close: last.close,
      volume,
      openInterest: openInterest > 0 ? openInterest : undefined,
      priceChange: 0, // Will be calculated in pre-save hook
      priceChangePercent: 0, // Will be calculated in pre-save hook
      range: 0, // Will be calculated in pre-save hook
      bodySize: 0, // Will be calculated in pre-save hook
      upperShadow: 0, // Will be calculated in pre-save hook
      lowerShadow: 0, // Will be calculated in pre-save hook
    };
    
    return aggregated;
  }
  
  /**
   * Aggregate features from multiple candles
   */
  private aggregateFeatures(candles: CandleWithFeatures[]): Partial<ICandleFeaturesData> | undefined {
    const candlesWithFeatures = candles.filter(c => c.features);
    
    if (candlesWithFeatures.length === 0) {
      return undefined;
    }
    
    const features = candlesWithFeatures.map(c => c.features!);
    const last = features[features.length - 1];
    
    // For most indicators, we take the last value
    // For some indicators, we might want to average or recalculate
    const aggregated: Partial<ICandleFeaturesData> = {
      // Moving averages - take last values
      sma5: last.sma5,
      sma10: last.sma10,
      sma20: last.sma20,
      sma50: last.sma50,
      sma200: last.sma200,
      ema9: last.ema9,
      ema12: last.ema12,
      ema21: last.ema21,
      ema26: last.ema26,
      
      // Momentum indicators - take last values
      rsi: last.rsi,
      rsi14: last.rsi14,
      stochK: last.stochK,
      stochD: last.stochD,
      williamsR: last.williamsR,
      
      // Trend indicators - take last values
      macd: last.macd,
      macdSignal: last.macdSignal,
      macdHistogram: last.macdHistogram,
      adx: last.adx,
      
      // Volatility indicators - recalculate or take last
      bbUpper: last.bbUpper,
      bbMiddle: last.bbMiddle,
      bbLower: last.bbLower,
      atr: this.averageValues(features.map(f => f.atr).filter(Boolean)),
      
      // Volume indicators - aggregate appropriately
      volumeSma: this.averageValues(features.map(f => f.volumeSma).filter(Boolean)),
      volumeRatio: this.averageValues(features.map(f => f.volumeRatio).filter(Boolean)),
      vwap: last.vwap, // VWAP for the period
      moneyFlow: this.sumValues(features.map(f => f.moneyFlow).filter(Boolean)),
      
      // Price action - take from last candle
      candlePattern: last.candlePattern,
      trendDirection: last.trendDirection,
      
      // Support/Resistance - take last values
      pivot: last.pivot,
      support1: last.support1,
      support2: last.support2,
      support3: last.support3,
      resistance1: last.resistance1,
      resistance2: last.resistance2,
      resistance3: last.resistance3,
      
      // Market structure - logical aggregation
      higherHigh: features.some(f => f.higherHigh),
      higherLow: features.some(f => f.higherLow),
      lowerHigh: features.some(f => f.lowerHigh),
      lowerLow: features.some(f => f.lowerLow),
      
      // Strength indicators - take last or average
      relativeStrength: last.relativeStrength,
      pricePosition: last.pricePosition,
      volumeStrength: this.averageValues(features.map(f => f.volumeStrength).filter(Boolean)),
    };
    
    return aggregated;
  }
  
  /**
   * Calculate average of values
   */
  private averageValues(values: number[]): number | undefined {
    if (values.length === 0) return undefined;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  /**
   * Calculate sum of values
   */
  private sumValues(values: number[]): number | undefined {
    if (values.length === 0) return undefined;
    return values.reduce((sum, val) => sum + val, 0);
  }
}

export default new CandleConverterService();