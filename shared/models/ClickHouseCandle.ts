import ClickHouseDatabase from '../database/clickhouse';
import { logger } from '../utils/logger';

export interface ICandle {
  symbol: string;
  timeframe: '15min' | '1hour' | '1day';
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest?: number;
  priceChange: number;
  priceChangePercent: number;
  range: number;
  bodySize: number;
  upperShadow: number;
  lowerShadow: number;
  createdAt: Date;
  updatedAt: Date;
}

class ClickHouseCandle {
  private db: ClickHouseDatabase;

  constructor() {
    this.db = ClickHouseDatabase.getInstance();
  }

  // Calculate derived fields from OHLCV data
  private calculateDerivedFields(candleData: Partial<ICandle>): Partial<ICandle> {
    if (!candleData.open || !candleData.high || !candleData.low || !candleData.close) {
      return candleData;
    }

    const priceChange = candleData.close - candleData.open;
    const range = candleData.high - candleData.low;
    const bodySize = Math.abs(candleData.close - candleData.open);
    const bodyTop = Math.max(candleData.open, candleData.close);
    const bodyBottom = Math.min(candleData.open, candleData.close);

    return {
      ...candleData,
      priceChange,
      priceChangePercent: (priceChange / candleData.open) * 100,
      range,
      bodySize,
      upperShadow: candleData.high - bodyTop,
      lowerShadow: bodyBottom - candleData.low
    };
  }

  // Create or update a candle
  async upsert(candleData: Partial<ICandle>): Promise<void> {
    try {
      const enrichedData = this.calculateDerivedFields(candleData);
      
      const data = {
        symbol: enrichedData.symbol,
        timeframe: enrichedData.timeframe,
        timestamp: enrichedData.timestamp,
        open: enrichedData.open,
        high: enrichedData.high,
        low: enrichedData.low,
        close: enrichedData.close,
        volume: enrichedData.volume || 0,
        open_interest: enrichedData.openInterest || null,
        price_change: enrichedData.priceChange || 0,
        price_change_percent: enrichedData.priceChangePercent || 0,
        range: enrichedData.range || 0,
        body_size: enrichedData.bodySize || 0,
        upper_shadow: enrichedData.upperShadow || 0,
        lower_shadow: enrichedData.lowerShadow || 0,
        created_at: enrichedData.createdAt || new Date(),
        updated_at: new Date()
      };

      await this.db.insert('screener_db.candles', [data]);
      logger.debug(`Candle for ${candleData.symbol} ${candleData.timeframe} upserted successfully`);
    } catch (error) {
      logger.error(`Failed to upsert candle for ${candleData.symbol}:`, error);
      throw error;
    }
  }

  // Bulk upsert multiple candles
  async bulkUpsert(candles: Partial<ICandle>[]): Promise<void> {
    try {
      const data = candles.map(candle => {
        const enrichedCandle = this.calculateDerivedFields(candle);
        return {
          symbol: enrichedCandle.symbol,
          timeframe: enrichedCandle.timeframe,
          timestamp: enrichedCandle.timestamp,
          open: enrichedCandle.open,
          high: enrichedCandle.high,
          low: enrichedCandle.low,
          close: enrichedCandle.close,
          volume: enrichedCandle.volume || 0,
          open_interest: enrichedCandle.openInterest || null,
          price_change: enrichedCandle.priceChange || 0,
          price_change_percent: enrichedCandle.priceChangePercent || 0,
          range: enrichedCandle.range || 0,
          body_size: enrichedCandle.bodySize || 0,
          upper_shadow: enrichedCandle.upperShadow || 0,
          lower_shadow: enrichedCandle.lowerShadow || 0,
          created_at: enrichedCandle.createdAt || new Date(),
          updated_at: new Date()
        };
      });

      await this.db.insert('screener_db.candles', data);
      logger.info(`Bulk upserted ${candles.length} candles`);
    } catch (error) {
      logger.error('Failed to bulk upsert candles:', error);
      throw error;
    }
  }

  // Find candles by criteria
  async find(criteria: Partial<{
    symbol: string;
    timeframe: string;
    timestampFrom: Date;
    timestampTo: Date;
  }>, options: {
    limit?: number;
    offset?: number;
    orderBy?: string;
  } = {}): Promise<ICandle[]> {
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
          open,
          high,
          low,
          close,
          volume,
          open_interest as openInterest,
          price_change as priceChange,
          price_change_percent as priceChangePercent,
          range,
          body_size as bodySize,
          upper_shadow as upperShadow,
          lower_shadow as lowerShadow,
          created_at as createdAt,
          updated_at as updatedAt
        FROM screener_db.candles
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
      })) as ICandle[];
    } catch (error) {
      logger.error('Failed to find candles:', error);
      throw error;
    }
  }

  // Find one candle by criteria
  async findOne(criteria: Partial<{
    symbol: string;
    timeframe: string;
    timestamp: Date;
  }>): Promise<ICandle | null> {
    const results = await this.find(criteria, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  // Count candles by criteria
  async count(criteria: Partial<{
    symbol: string;
    timeframe: string;
    timestampFrom: Date;
    timestampTo: Date;
  }> = {}): Promise<number> {
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

      const query = `
        SELECT count() as count
        FROM screener_db.candles
        ${whereClause}
      `;

      const result = await this.db.query(query);
      return result[0]?.count || 0;
    } catch (error) {
      logger.error('Failed to count candles:', error);
      throw error;
    }
  }

  // Get recent candles for a symbol and timeframe (for feature calculation)
  async getRecentCandles(symbol: string, timeframe: string, limit: number = 200): Promise<ICandle[]> {
    return this.find(
      { symbol, timeframe },
      { 
        limit,
        orderBy: 'ORDER BY timestamp DESC'
      }
    );
  }

  // Get candles in date range
  async getCandlesInRange(
    symbol: string,
    timeframe: string,
    fromDate: Date,
    toDate: Date
  ): Promise<ICandle[]> {
    return this.find(
      {
        symbol,
        timeframe,
        timestampFrom: fromDate,
        timestampTo: toDate
      },
      { orderBy: 'ORDER BY timestamp ASC' }
    );
  }

  // Parse Upstox candle data (static method equivalent)
  static parseUpstoxCandle(symbol: string, timeframe: string, candleArray: number[]): Partial<ICandle> {
    return {
      symbol: symbol.toUpperCase(),
      timeframe: timeframe as '15min' | '1hour' | '1day',
      timestamp: new Date(candleArray[0]),
      open: candleArray[1],
      high: candleArray[2],
      low: candleArray[3],
      close: candleArray[4],
      volume: candleArray[5],
      openInterest: candleArray[6] || undefined
    };
  }

  // Get latest timestamp for a symbol and timeframe (useful for incremental sync)
  async getLatestTimestamp(symbol: string, timeframe: string): Promise<Date | null> {
    try {
      const query = `
        SELECT max(timestamp) as latest_timestamp
        FROM screener_db.candles
        WHERE symbol = '${symbol}' AND timeframe = '${timeframe}'
      `;

      const result = await this.db.query(query);
      const latestTimestamp = result[0]?.latest_timestamp;
      
      return latestTimestamp ? new Date(latestTimestamp) : null;
    } catch (error) {
      logger.error(`Failed to get latest timestamp for ${symbol}:`, error);
      return null;
    }
  }
}

export default ClickHouseCandle;