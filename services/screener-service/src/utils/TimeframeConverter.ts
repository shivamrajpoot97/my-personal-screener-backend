import { ClickHouseCandle } from '../../../../shared/models';
import { logger } from '../../../../shared/utils/logger';

export interface ConvertedCandle {
  symbol: string;
  timeframe: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  priceChange: number;
  priceChangePercent: number;
}

/**
 * TimeframeConverter - Converts candles from different timeframes to a unified timeframe
 * Handles the issue where latest candles differ across timeframes
 */
class TimeframeConverter {
  private candleModel: ClickHouseCandle;

  constructor() {
    this.candleModel = new ClickHouseCandle();
  }

  /**
   * Get unified candles for a symbol - converts all to daily timeframe
   * This ensures we're comparing apples to apples across all stocks
   */
  async getUnifiedCandles(
    symbol: string,
    targetTimeframe: '15min' | '1hour' | '1day',
    lookbackDays: number
  ): Promise<ConvertedCandle[]> {
    try {
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

      // Try to get data from target timeframe first
      let candles = await this.candleModel.getCandlesInRange(
        symbol,
        targetTimeframe,
        fromDate,
        toDate
      );

      // If not enough data in target timeframe, try to convert from lower timeframes
      if (candles.length < 30) {
        logger.debug(`Not enough ${targetTimeframe} candles for ${symbol}, trying conversion`);
        candles = await this.convertToTimeframe(symbol, targetTimeframe, fromDate, toDate);
      }

      return this.normalizeCandles(candles, targetTimeframe);

    } catch (error) {
      logger.error(`Error getting unified candles for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Convert lower timeframe candles to higher timeframe
   * Example: Convert 15min -> 1hour -> 1day
   */
  private async convertToTimeframe(
    symbol: string,
    targetTimeframe: '15min' | '1hour' | '1day',
    fromDate: Date,
    toDate: Date
  ): Promise<any[]> {
    try {
      // Determine source timeframe
      let sourceTimeframe: '15min' | '1hour' | '1day';
      
      if (targetTimeframe === '1day') {
        // Try 1hour first, then 15min
        sourceTimeframe = '1hour';
        let sourceCandles = await this.candleModel.getCandlesInRange(
          symbol,
          sourceTimeframe,
          fromDate,
          toDate
        );
        
        if (sourceCandles.length === 0) {
          sourceTimeframe = '15min';
          sourceCandles = await this.candleModel.getCandlesInRange(
            symbol,
            sourceTimeframe,
            fromDate,
            toDate
          );
        }

        if (sourceCandles.length === 0) {
          return [];
        }

        return this.aggregateToDaily(sourceCandles);
        
      } else if (targetTimeframe === '1hour') {
        // Convert from 15min to 1hour
        sourceTimeframe = '15min';
        const sourceCandles = await this.candleModel.getCandlesInRange(
          symbol,
          sourceTimeframe,
          fromDate,
          toDate
        );

        if (sourceCandles.length === 0) {
          return [];
        }

        return this.aggregateTo1Hour(sourceCandles);
      }

      return [];

    } catch (error) {
      logger.error(`Error converting timeframe for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Aggregate lower timeframe candles to daily
   */
  private aggregateToDaily(candles: any[]): any[] {
    const dailyCandles: Map<string, any> = new Map();

    for (const candle of candles) {
      const dateKey = candle.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD

      if (!dailyCandles.has(dateKey)) {
        // First candle of the day
        dailyCandles.set(dateKey, {
          symbol: candle.symbol,
          timestamp: new Date(dateKey + 'T00:00:00'),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          count: 1
        });
      } else {
        // Update existing day candle
        const dayCandle = dailyCandles.get(dateKey)!;
        dayCandle.high = Math.max(dayCandle.high, candle.high);
        dayCandle.low = Math.min(dayCandle.low, candle.low);
        dayCandle.close = candle.close; // Last close of the day
        dayCandle.volume += candle.volume;
        dayCandle.count++;
      }
    }

    return Array.from(dailyCandles.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * Aggregate 15min candles to 1hour
   */
  private aggregateTo1Hour(candles: any[]): any[] {
    const hourlyCandles: Map<string, any> = new Map();

    for (const candle of candles) {
      const hour = new Date(candle.timestamp);
      hour.setMinutes(0, 0, 0); // Round to hour
      const hourKey = hour.toISOString();

      if (!hourlyCandles.has(hourKey)) {
        hourlyCandles.set(hourKey, {
          symbol: candle.symbol,
          timestamp: hour,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          count: 1
        });
      } else {
        const hourCandle = hourlyCandles.get(hourKey)!;
        hourCandle.high = Math.max(hourCandle.high, candle.high);
        hourCandle.low = Math.min(hourCandle.low, candle.low);
        hourCandle.close = candle.close;
        hourCandle.volume += candle.volume;
        hourCandle.count++;
      }
    }

    return Array.from(hourlyCandles.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * Normalize candles to consistent format
   */
  private normalizeCandles(candles: any[], timeframe: string): ConvertedCandle[] {
    return candles.map(candle => {
      const priceChange = candle.close - candle.open;
      const priceChangePercent = (priceChange / candle.open) * 100;

      return {
        symbol: candle.symbol,
        timeframe,
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        priceChange,
        priceChangePercent
      };
    });
  }

  /**
   * Get the most recent candle timestamp for a symbol across all timeframes
   */
  async getLatestTimestamp(symbol: string): Promise<{
    '15min'?: Date;
    '1hour'?: Date;
    '1day'?: Date;
  }> {
    const timestamps: any = {};

    for (const tf of ['15min', '1hour', '1day'] as const) {
      const latest = await this.candleModel.getLatestTimestamp(symbol, tf);
      if (latest) {
        timestamps[tf] = latest;
      }
    }

    return timestamps;
  }
}

export default TimeframeConverter;