import { Candle, CandleFeatures, CandleBackup, ICandleData, ICandleFeaturesData } from '@shared/models';
import { logger } from '@shared/utils/logger';
import mongoose from 'mongoose';

export interface CandleQuery {
  symbol?: string;
  timeframe?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  includeFeatures?: boolean;
}

export interface CandleWithFeatures extends ICandleData {
  _id: string;
  features?: ICandleFeaturesData;
}

export class CandleService {
  
  /**
   * Store candle data with optional features
   */
  async storeCandle(
    candleData: ICandleData, 
    featuresData?: Omit<ICandleFeaturesData, 'candleId' | 'symbol' | 'timeframe' | 'timestamp'>
  ): Promise<{ candle: any; features?: any }> {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      // Create candle
      const candle = new Candle(candleData);
      await candle.save({ session });
      
      let features;
      if (featuresData) {
        // Create features with reference to candle
        features = new CandleFeatures({
          ...featuresData,
          candleId: candle._id,
          symbol: candleData.symbol,
          timeframe: candleData.timeframe,
          timestamp: candleData.timestamp,
        });
        await features.save({ session });
      }
      
      await session.commitTransaction();
      
      logger.info(`Stored candle for ${candleData.symbol} at ${candleData.timestamp}`);
      return { candle, features };
      
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error storing candle:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Store multiple candles in batch
   */
  async storeCandlesBatch(
    candlesData: ICandleData[], 
    featuresData?: Omit<ICandleFeaturesData, 'candleId' | 'symbol' | 'timeframe' | 'timestamp'>[]
  ): Promise<{ candles: any[]; features?: any[] }> {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      // Insert candles in batch
      const candles = await Candle.insertMany(candlesData, { session, ordered: false });
      
      let features;
      if (featuresData && featuresData.length === candlesData.length) {
        // Create features with references to candles
        const featuresWithRefs = featuresData.map((feature, index) => ({
          ...feature,
          candleId: candles[index]._id,
          symbol: candlesData[index].symbol,
          timeframe: candlesData[index].timeframe,
          timestamp: candlesData[index].timestamp,
        }));
        
        features = await CandleFeatures.insertMany(featuresWithRefs, { session, ordered: false });
      }
      
      await session.commitTransaction();
      
      logger.info(`Stored ${candles.length} candles in batch`);
      return { candles, features };
      
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error storing candles batch:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Get candles with optional features
   */
  async getCandles(query: CandleQuery): Promise<CandleWithFeatures[]> {
    try {
      const filter: any = {};
      
      if (query.symbol) filter.symbol = query.symbol.toUpperCase();
      if (query.timeframe) filter.timeframe = query.timeframe;
      if (query.from || query.to) {
        filter.timestamp = {};
        if (query.from) filter.timestamp.$gte = query.from;
        if (query.to) filter.timestamp.$lte = query.to;
      }
      
      let candleQuery = Candle.find(filter)
        .sort({ timestamp: -1 })
        .limit(query.limit || 1000);
      
      if (query.includeFeatures) {
        candleQuery = candleQuery.populate({
          path: 'features',
          model: 'CandleFeatures',
          localField: '_id',
          foreignField: 'candleId'
        });
      }
      
      const candles = await candleQuery.exec();
      
      // If features are requested but not populated, fetch them separately
      if (query.includeFeatures && candles.length > 0) {
        const candleIds = candles.map(c => c._id);
        const features = await CandleFeatures.find({ candleId: { $in: candleIds } });
        const featuresMap = new Map(features.map(f => [f.candleId.toString(), f]));
        
        return candles.map(candle => ({
          ...candle.toObject(),
          features: featuresMap.get(candle._id.toString())
        }));
      }
      
      return candles.map(c => c.toObject());
      
    } catch (error) {
      logger.error('Error getting candles:', error);
      throw error;
    }
  }
  
  /**
   * Get latest candle for a symbol and timeframe
   */
  async getLatestCandle(symbol: string, timeframe: string): Promise<CandleWithFeatures | null> {
    try {
      const candles = await this.getCandles({
        symbol,
        timeframe,
        limit: 1,
        includeFeatures: true
      });
      
      return candles.length > 0 ? candles[0] : null;
    } catch (error) {
      logger.error('Error getting latest candle:', error);
      throw error;
    }
  }
  
  /**
   * Delete old candles (used by conversion service)
   */
  async deleteCandles(query: { symbol?: string; timeframe?: string; before?: Date }): Promise<number> {
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      
      const filter: any = {};
      if (query.symbol) filter.symbol = query.symbol.toUpperCase();
      if (query.timeframe) filter.timeframe = query.timeframe;
      if (query.before) filter.timestamp = { $lt: query.before };
      
      // Delete features first
      const candlesToDelete = await Candle.find(filter).select('_id');
      const candleIds = candlesToDelete.map(c => c._id);
      
      if (candleIds.length > 0) {
        await CandleFeatures.deleteMany({ candleId: { $in: candleIds } }, { session });
        const deleteResult = await Candle.deleteMany(filter, { session });
        
        await session.commitTransaction();
        
        logger.info(`Deleted ${deleteResult.deletedCount} candles and their features`);
        return deleteResult.deletedCount || 0;
      }
      
      await session.commitTransaction();
      return 0;
      
    } catch (error) {
      await session.abortTransaction();
      logger.error('Error deleting candles:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Get candles for conversion (with features)
   */
  async getCandlesForConversion(
    symbol: string, 
    timeframe: string, 
    date: Date
  ): Promise<CandleWithFeatures[]> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      return await this.getCandles({
        symbol,
        timeframe,
        from: startOfDay,
        to: endOfDay,
        includeFeatures: true
      });
    } catch (error) {
      logger.error('Error getting candles for conversion:', error);
      throw error;
    }
  }
  
  /**
   * Store backup data
   */
  async storeBackup(
    symbol: string,
    originalTimeframe: string,
    targetTimeframe: string,
    date: Date,
    candlesData: any[],
    featuresData?: any[]
  ): Promise<void> {
    try {
      const backup = new CandleBackup({
        symbol: symbol.toUpperCase(),
        originalTimeframe,
        targetTimeframe,
        date,
        candlesData: candlesData.map(c => ({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          openInterest: c.openInterest
        })),
        featuresData: featuresData?.map(f => ({
          timestamp: f.timestamp,
          indicators: f
        })),
        compressionRatio: candlesData.length
      });
      
      await backup.save();
      
      logger.info(`Stored backup for ${symbol} ${originalTimeframe} -> ${targetTimeframe} on ${date.toDateString()}`);
    } catch (error) {
      logger.error('Error storing backup:', error);
      throw error;
    }
  }
  
  /**
   * Get available symbols and timeframes
   */
  async getAvailableData(): Promise<{ symbol: string; timeframes: string[]; latestTimestamp: Date }[]> {
    try {
      const pipeline = [
        {
          $group: {
            _id: '$symbol',
            timeframes: { $addToSet: '$timeframe' },
            latestTimestamp: { $max: '$timestamp' }
          }
        },
        {
          $project: {
            symbol: '$_id',
            timeframes: 1,
            latestTimestamp: 1,
            _id: 0
          }
        },
        { $sort: { symbol: 1 } }
      ];
      
      return await Candle.aggregate(pipeline);
    } catch (error) {
      logger.error('Error getting available data:', error);
      throw error;
    }
  }
}

export default new CandleService();