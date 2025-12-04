import ClickHouseDatabase from '../database/clickhouse';
import { logger } from '../utils/logger';

// Feature key mappings (same as MongoDB version)
export const FEATURE_KEYS = {
  // Moving Averages
  sma5: 'sma5',
  sma10: 'sma10', 
  sma20: 'sma20',
  sma50: 'sma50',
  sma200: 'sma200',
  ema9: 'ema9',
  ema12: 'ema12',
  ema21: 'ema21',
  ema26: 'ema26',

  // Momentum
  rsi: 'rsi',
  rsi14: 'rsi14',
  stochK: 'stoch_k',
  stochD: 'stoch_d',
  williamsR: 'williams_r',

  // Trend
  macd: 'macd',
  macdSignal: 'macd_signal',
  macdHistogram: 'macd_histogram',
  adx: 'adx',

  // Volatility
  bbUpper: 'bb_upper',
  bbMiddle: 'bb_middle',
  bbLower: 'bb_lower',
  atr: 'atr',

  // Volume
  volumeSma: 'volume_sma',
  volumeRatio: 'volume_ratio',
  vwap: 'vwap',
  moneyFlow: 'money_flow',

  // Price Action
  candlePattern: 'candle_pattern',
  trendDirection: 'trend_direction',

  // Support/Resistance
  pivot: 'pivot',
  support1: 'support1',
  support2: 'support2',
  support3: 'support3',
  resistance1: 'resistance1',
  resistance2: 'resistance2',
  resistance3: 'resistance3',

  // Market Structure
  higherHigh: 'higher_high',
  higherLow: 'higher_low',
  lowerHigh: 'lower_high',
  lowerLow: 'lower_low',

  // Strength
  relativeStrength: 'relative_strength',
  pricePosition: 'price_position',
  volumeStrength: 'volume_strength'
} as const;

// Timeframe-specific feature sets
export const TIMEFRAME_FEATURES = {
  '15min': ['sma5', 'sma10', 'rsi', 'vwap', 'atr', 'volume_sma', 'candle_pattern'],
  '1hour': ['sma20', 'ema21', 'rsi14', 'macd', 'macd_signal', 'bb_upper', 'bb_middle', 'bb_lower', 'adx'],
  '1day': ['sma20', 'sma50', 'sma200', 'rsi14', 'adx', 'pivot', 'support1', 'resistance1', 'relative_strength', 'price_position']
} as const;

export interface ICandleFeatures {
  symbol: string;
  timeframe: '15min' | '1hour' | '1day';
  timestamp: Date;
  candleRef: string; // Reference to candle
  // Moving Averages
  sma5?: number;
  sma10?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  ema9?: number;
  ema12?: number;
  ema21?: number;
  ema26?: number;
  // Momentum
  rsi?: number;
  rsi14?: number;
  stochK?: number;
  stochD?: number;
  williamsR?: number;
  // Trend
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  adx?: number;
  // Volatility
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  atr?: number;
  // Volume
  volumeSma?: number;
  volumeRatio?: number;
  vwap?: number;
  moneyFlow?: number;
  // Price Action
  candlePattern?: string;
  trendDirection?: number;
  // Support/Resistance
  pivot?: number;
  support1?: number;
  support2?: number;
  support3?: number;
  resistance1?: number;
  resistance2?: number;
  resistance3?: number;
  // Market Structure
  higherHigh?: boolean;
  higherLow?: boolean;
  lowerHigh?: boolean;
  lowerLow?: boolean;
  // Strength
  relativeStrength?: number;
  pricePosition?: number;
  volumeStrength?: number;
  createdAt: Date;
  updatedAt: Date;
}

class ClickHouseCandleFeatures {
  private db: ClickHouseDatabase;

  constructor() {
    this.db = ClickHouseDatabase.getInstance();
  }

  // Create candle reference string
  private createCandleRef(symbol: string, timeframe: string, timestamp: Date): string {
    return `${symbol}_${timeframe}_${timestamp.getTime()}`;
  }

  // Upsert candle features
  async upsert(featuresData: Partial<ICandleFeatures>): Promise<void> {
    try {
      const data = {
        symbol: featuresData.symbol,
        timeframe: featuresData.timeframe,
        timestamp: featuresData.timestamp,
        candle_ref: featuresData.candleRef || this.createCandleRef(
          featuresData.symbol!,
          featuresData.timeframe!,
          featuresData.timestamp!
        ),
        // Moving Averages
        sma5: featuresData.sma5 || null,
        sma10: featuresData.sma10 || null,
        sma20: featuresData.sma20 || null,
        sma50: featuresData.sma50 || null,
        sma200: featuresData.sma200 || null,
        ema9: featuresData.ema9 || null,
        ema12: featuresData.ema12 || null,
        ema21: featuresData.ema21 || null,
        ema26: featuresData.ema26 || null,
        // Momentum
        rsi: featuresData.rsi || null,
        rsi14: featuresData.rsi14 || null,
        stoch_k: featuresData.stochK || null,
        stoch_d: featuresData.stochD || null,
        williams_r: featuresData.williamsR || null,
        // Trend
        macd: featuresData.macd || null,
        macd_signal: featuresData.macdSignal || null,
        macd_histogram: featuresData.macdHistogram || null,
        adx: featuresData.adx || null,
        // Volatility
        bb_upper: featuresData.bbUpper || null,
        bb_middle: featuresData.bbMiddle || null,
        bb_lower: featuresData.bbLower || null,
        atr: featuresData.atr || null,
        // Volume
        volume_sma: featuresData.volumeSma || null,
        volume_ratio: featuresData.volumeRatio || null,
        vwap: featuresData.vwap || null,
        money_flow: featuresData.moneyFlow || null,
        // Price Action
        candle_pattern: featuresData.candlePattern || null,
        trend_direction: featuresData.trendDirection || null,
        // Support/Resistance
        pivot: featuresData.pivot || null,
        support1: featuresData.support1 || null,
        support2: featuresData.support2 || null,
        support3: featuresData.support3 || null,
        resistance1: featuresData.resistance1 || null,
        resistance2: featuresData.resistance2 || null,
        resistance3: featuresData.resistance3 || null,
        // Market Structure
        higher_high: featuresData.higherHigh || null,
        higher_low: featuresData.higherLow || null,
        lower_high: featuresData.lowerHigh || null,
        lower_low: featuresData.lowerLow || null,
        // Strength
        relative_strength: featuresData.relativeStrength || null,
        price_position: featuresData.pricePosition || null,
        volume_strength: featuresData.volumeStrength || null,
        created_at: featuresData.createdAt || new Date(),
        updated_at: new Date()
      };

      await this.db.insert('screener_db.candle_features', [data]);
      logger.debug(`Features for ${featuresData.symbol} ${featuresData.timeframe} upserted successfully`);
    } catch (error) {
      logger.error(`Failed to upsert features for ${featuresData.symbol}:`, error);
      throw error;
    }
  }

  // Bulk upsert features
  async bulkUpsert(featuresArray: Partial<ICandleFeatures>[]): Promise<void> {
    try {
      const data = featuresArray.map(features => ({
        symbol: features.symbol,
        timeframe: features.timeframe,
        timestamp: features.timestamp,
        candle_ref: features.candleRef || this.createCandleRef(
          features.symbol!,
          features.timeframe!,
          features.timestamp!
        ),
        // All the feature fields...
        sma5: features.sma5 || null,
        sma10: features.sma10 || null,
        sma20: features.sma20 || null,
        sma50: features.sma50 || null,
        sma200: features.sma200 || null,
        rsi: features.rsi || null,
        rsi14: features.rsi14 || null,
        vwap: features.vwap || null,
        atr: features.atr || null,
        volume_sma: features.volumeSma || null,
        trend_direction: features.trendDirection || null,
        created_at: features.createdAt || new Date(),
        updated_at: new Date()
      }));

      await this.db.insert('screener_db.candle_features', data);
      logger.info(`Bulk upserted ${featuresArray.length} feature sets`);
    } catch (error) {
      logger.error('Failed to bulk upsert features:', error);
      throw error;
    }
  }

  // Find features by criteria
  async find(criteria: Partial<{
    symbol: string;
    timeframe: string;
    timestampFrom: Date;
    timestampTo: Date;
  }>, options: {
    limit?: number;
    offset?: number;
    orderBy?: string;
  } = {}): Promise<ICandleFeatures[]> {
    try {
      let whereClause = 'WHERE 1=1';
      
      if (criteria.symbol) {
        whereClause += ` AND symbol = '${criteria.symbol}'`;
      }
      if (criteria.timeframe) {
        whereClause += ` AND timeframe = '${criteria.timeframe}'`;
      }
      if (criteria.timestampFrom) {
        whereClause += ` AND timestamp >= '${criteria.timestampFrom.toISOString()}'`;
      }
      if (criteria.timestampTo) {
        whereClause += ` AND timestamp <= '${criteria.timestampTo.toISOString()}'`;
      }

      let orderClause = options.orderBy || 'ORDER BY timestamp DESC';
      let limitClause = '';
      
      if (options.limit) {
        limitClause = `LIMIT ${options.limit}`;
        if (options.offset) {
          limitClause += ` OFFSET ${options.offset}`;
        }
      }

      const query = `
        SELECT 
          symbol,
          timeframe,
          timestamp,
          candle_ref as candleRef,
          sma5,
          sma10,
          sma20,
          sma50,
          sma200,
          rsi,
          rsi14,
          vwap,
          atr,
          volume_sma as volumeSma,
          trend_direction as trendDirection,
          created_at as createdAt,
          updated_at as updatedAt
        FROM screener_db.candle_features
        ${whereClause}
        ${orderClause}
        ${limitClause}
      `;

      const result = await this.db.query(query);
      return result.map((row: any) => ({
        ...row,
        timestamp: new Date(row.timestamp),
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
      })) as ICandleFeatures[];
    } catch (error) {
      logger.error('Failed to find features:', error);
      throw error;
    }
  }

  // Helper method to create features from compact format (for migration compatibility)
  static createFromCompactFeatures(
    symbol: string,
    timeframe: string,
    timestamp: Date,
    compactFeatures: Record<string, any>
  ): Partial<ICandleFeatures> {
    const features: Partial<ICandleFeatures> = {
      symbol,
      timeframe: timeframe as '15min' | '1hour' | '1day',
      timestamp
    };

    // Map compact keys to full feature names
    const keyMapping = {
      's5': 'sma5',
      's10': 'sma10',
      's20': 'sma20',
      's50': 'sma50',
      's200': 'sma200',
      'r': 'rsi',
      'r14': 'rsi14',
      'vw': 'vwap',
      'atr': 'atr',
      'vs': 'volumeSma',
      'td': 'trendDirection'
    };

    for (const [compactKey, value] of Object.entries(compactFeatures)) {
      const fullKey = keyMapping[compactKey as keyof typeof keyMapping];
      if (fullKey && value !== null) {
        (features as any)[fullKey] = value;
      }
    }

    return features;
  }
}

export default ClickHouseCandleFeatures;

export default ClickHouseCandleFeatures;