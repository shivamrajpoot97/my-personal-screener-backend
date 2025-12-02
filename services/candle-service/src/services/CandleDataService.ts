import CandleService, { CandleQuery, CandleWithFeatures } from './CandleService';
import { logger } from '@shared/utils/logger';
import { ICandleData } from '@shared/models';

export interface StrategyDataRequest {
  symbol: string;
  timeframe: '15min' | '1hour' | '1day';
  periods: number; // Number of candles needed
  requiredIndicators?: string[]; // Optional: specific indicators needed
  endDate?: Date; // Optional: get data up to this date
}

export interface OHLCVData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest?: number;
}

export interface TechnicalIndicators {
  // Moving averages
  sma?: {
    sma5?: number;
    sma10?: number;
    sma20?: number;
    sma50?: number;
    sma200?: number;
  };
  ema?: {
    ema9?: number;
    ema12?: number;
    ema21?: number;
    ema26?: number;
  };
  // Momentum
  momentum?: {
    rsi?: number;
    rsi14?: number;
    stochK?: number;
    stochD?: number;
    williamsR?: number;
  };
  // Trend
  trend?: {
    macd?: number;
    macdSignal?: number;
    macdHistogram?: number;
    adx?: number;
    trendDirection?: 'up' | 'down' | 'sideways';
  };
  // Volatility
  volatility?: {
    bbUpper?: number;
    bbMiddle?: number;
    bbLower?: number;
    atr?: number;
  };
  // Volume
  volume?: {
    volumeSma?: number;
    volumeRatio?: number;
    vwap?: number;
    moneyFlow?: number;
    volumeStrength?: number;
  };
  // Support/Resistance
  levels?: {
    pivot?: number;
    support1?: number;
    support2?: number;
    support3?: number;
    resistance1?: number;
    resistance2?: number;
    resistance3?: number;
  };
  // Market structure
  structure?: {
    higherHigh?: boolean;
    higherLow?: boolean;
    lowerHigh?: boolean;
    lowerLow?: boolean;
    pricePosition?: number;
    relativeStrength?: number;
  };
}

export interface StrategyCandle {
  ohlcv: OHLCVData;
  indicators: TechnicalIndicators;
  derived: {
    priceChange: number;
    priceChangePercent: number;
    range: number;
    bodySize: number;
    upperShadow: number;
    lowerShadow: number;
    candleType: 'bullish' | 'bearish' | 'doji';
    candlePattern?: string;
  };
}

export interface MultiTimeframeData {
  primary: StrategyCandle[];
  higher?: StrategyCandle[]; // Higher timeframe for context
  lower?: StrategyCandle[]; // Lower timeframe for precision
}

/**
 * High-level service for providing clean data to trading strategies
 */
export class CandleDataService {
  
  /**
   * Get formatted data for a trading strategy
   */
  async getStrategyData(request: StrategyDataRequest): Promise<StrategyCandle[]> {
    try {
      const query: CandleQuery = {
        symbol: request.symbol,
        timeframe: request.timeframe,
        limit: request.periods,
        includeFeatures: true,
        to: request.endDate
      };
      
      const candles = await CandleService.getCandles(query);
      
      if (candles.length === 0) {
        logger.warn(`No candles found for ${request.symbol} ${request.timeframe}`);
        return [];
      }
      
      // Sort by timestamp ascending (oldest first)
      candles.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      return candles.map(candle => this.formatCandleForStrategy(candle));
      
    } catch (error) {
      logger.error('Error getting strategy data:', error);
      throw error;
    }
  }
  
  /**
   * Get multi-timeframe data for comprehensive analysis
   */
  async getMultiTimeframeData(
    symbol: string,
    primaryTimeframe: '15min' | '1hour' | '1day',
    periods: number,
    includeHigher: boolean = true,
    includeLower: boolean = false
  ): Promise<MultiTimeframeData> {
    try {
      const result: MultiTimeframeData = {
        primary: await this.getStrategyData({
          symbol,
          timeframe: primaryTimeframe,
          periods
        })
      };
      
      if (includeHigher) {
        const higherTimeframe = this.getHigherTimeframe(primaryTimeframe);
        if (higherTimeframe) {
          result.higher = await this.getStrategyData({
            symbol,
            timeframe: higherTimeframe,
            periods: Math.ceil(periods / 4) // Less periods for higher timeframe
          });
        }
      }
      
      if (includeLower) {
        const lowerTimeframe = this.getLowerTimeframe(primaryTimeframe);
        if (lowerTimeframe) {
          result.lower = await this.getStrategyData({
            symbol,
            timeframe: lowerTimeframe,
            periods: periods * 4 // More periods for lower timeframe
          });
        }
      }
      
      return result;
      
    } catch (error) {
      logger.error('Error getting multi-timeframe data:', error);
      throw error;
    }
  }
  
  /**
   * Get real-time data for live trading
   */
  async getRealtimeData(
    symbol: string,
    timeframe: '15min' | '1hour' | '1day'
  ): Promise<StrategyCandle | null> {
    try {
      const latestCandle = await CandleService.getLatestCandle(symbol, timeframe);
      
      if (!latestCandle) {
        return null;
      }
      
      return this.formatCandleForStrategy(latestCandle);
      
    } catch (error) {
      logger.error('Error getting realtime data:', error);
      throw error;
    }
  }
  
  /**
   * Get historical data for backtesting
   */
  async getBacktestData(
    symbol: string,
    timeframe: '15min' | '1hour' | '1day',
    startDate: Date,
    endDate: Date
  ): Promise<StrategyCandle[]> {
    try {
      const query: CandleQuery = {
        symbol,
        timeframe,
        from: startDate,
        to: endDate,
        includeFeatures: true,
        limit: 10000 // High limit for backtesting
      };
      
      const candles = await CandleService.getCandles(query);
      
      // Sort by timestamp ascending
      candles.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      return candles.map(candle => this.formatCandleForStrategy(candle));
      
    } catch (error) {
      logger.error('Error getting backtest data:', error);
      throw error;
    }
  }
  
  /**
   * Check data availability for a symbol
   */
  async checkDataAvailability(symbol: string): Promise<{
    available: boolean;
    timeframes: string[];
    latestTimestamp?: Date;
    oldestTimestamp?: Date;
    totalCandles: number;
  }> {
    try {
      const availableData = await CandleService.getAvailableData();
      const symbolData = availableData.find(d => d.symbol === symbol);
      
      if (!symbolData) {
        return {
          available: false,
          timeframes: [],
          totalCandles: 0
        };
      }
      
      // Get oldest timestamp
      const oldestCandle = await CandleService.getCandles({
        symbol,
        limit: 1
      });
      
      // Count total candles
      const { Candle } = await import('@shared/models');
      const totalCandles = await Candle.countDocuments({ symbol });
      
      return {
        available: true,
        timeframes: symbolData.timeframes,
        latestTimestamp: symbolData.latestTimestamp,
        oldestTimestamp: oldestCandle[0]?.timestamp,
        totalCandles
      };
      
    } catch (error) {
      logger.error('Error checking data availability:', error);
      throw error;
    }
  }
  
  /**
   * Format candle data for strategy consumption
   */
  private formatCandleForStrategy(candle: CandleWithFeatures): StrategyCandle {
    const features = candle.features;
    
    return {
      ohlcv: {
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        openInterest: candle.openInterest
      },
      indicators: {
        sma: features ? {
          sma5: features.sma5,
          sma10: features.sma10,
          sma20: features.sma20,
          sma50: features.sma50,
          sma200: features.sma200
        } : {},
        ema: features ? {
          ema9: features.ema9,
          ema12: features.ema12,
          ema21: features.ema21,
          ema26: features.ema26
        } : {},
        momentum: features ? {
          rsi: features.rsi,
          rsi14: features.rsi14,
          stochK: features.stochK,
          stochD: features.stochD,
          williamsR: features.williamsR
        } : {},
        trend: features ? {
          macd: features.macd,
          macdSignal: features.macdSignal,
          macdHistogram: features.macdHistogram,
          adx: features.adx,
          trendDirection: features.trendDirection
        } : {},
        volatility: features ? {
          bbUpper: features.bbUpper,
          bbMiddle: features.bbMiddle,
          bbLower: features.bbLower,
          atr: features.atr
        } : {},
        volume: features ? {
          volumeSma: features.volumeSma,
          volumeRatio: features.volumeRatio,
          vwap: features.vwap,
          moneyFlow: features.moneyFlow,
          volumeStrength: features.volumeStrength
        } : {},
        levels: features ? {
          pivot: features.pivot,
          support1: features.support1,
          support2: features.support2,
          support3: features.support3,
          resistance1: features.resistance1,
          resistance2: features.resistance2,
          resistance3: features.resistance3
        } : {},
        structure: features ? {
          higherHigh: features.higherHigh,
          higherLow: features.higherLow,
          lowerHigh: features.lowerHigh,
          lowerLow: features.lowerLow,
          pricePosition: features.pricePosition,
          relativeStrength: features.relativeStrength
        } : {}
      },
      derived: {
        priceChange: candle.priceChange,
        priceChangePercent: candle.priceChangePercent,
        range: candle.range,
        bodySize: candle.bodySize,
        upperShadow: candle.upperShadow,
        lowerShadow: candle.lowerShadow,
        candleType: this.getCandleType(candle),
        candlePattern: features?.candlePattern
      }
    };
  }
  
  /**
   * Get candle type
   */
  private getCandleType(candle: ICandleData): 'bullish' | 'bearish' | 'doji' {
    if (candle.close > candle.open) return 'bullish';
    if (candle.close < candle.open) return 'bearish';
    return 'doji';
  }
  
  /**
   * Get higher timeframe
   */
  private getHigherTimeframe(timeframe: '15min' | '1hour' | '1day'): '1hour' | '1day' | null {
    const hierarchy = {
      '15min': '1hour',
      '1hour': '1day',
      '1day': null
    };
    
    return hierarchy[timeframe] as '1hour' | '1day' | null;
  }
  
  /**
   * Get lower timeframe
   */
  private getLowerTimeframe(timeframe: '15min' | '1hour' | '1day'): '15min' | '1hour' | null {
    const hierarchy = {
      '1day': '1hour',
      '1hour': '15min',
      '15min': null
    };
    
    return hierarchy[timeframe] as '15min' | '1hour' | null;
  }
}

export default new CandleDataService();
</contents>