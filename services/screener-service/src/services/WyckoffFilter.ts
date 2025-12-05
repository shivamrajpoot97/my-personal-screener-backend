import { logger } from '../../../../shared/utils/logger';
import TimeframeConverter, { ConvertedCandle } from '../utils/TimeframeConverter';

export interface WyckoffResult {
  symbol: string;
  phase: 'C' | 'D';
  confidence: number;
  supportLevel: number;
  resistanceLevel: number;
  volume: number;
  priceAction: string;
  lastPrice: number;
  analysis: {
    spring?: boolean;
    test?: boolean;
    sos?: boolean;
    backup?: boolean;
    volumeIncrease?: boolean;
    rangeBreakout?: boolean;
  };
  timestamp: Date;
  timeframe: string;
}

export interface WyckoffFilterConfig {
  minConfidence?: number;
  timeframe?: '15min' | '1hour' | '1day';
  lookbackDays?: number;
  minRangePercent?: number;
  maxRangePercent?: number;
}

/**
 * WyckoffFilter - Detects Wyckoff accumulation Phase C and D patterns
 * Handles timeframe conversion for consistent analysis
 */
class WyckoffFilter {
  private converter: TimeframeConverter;
  private config: Required<WyckoffFilterConfig>;

  constructor(config: WyckoffFilterConfig = {}) {
    this.converter = new TimeframeConverter();
    this.config = {
      minConfidence: config.minConfidence || 70,
      timeframe: config.timeframe || '1day',
      lookbackDays: config.lookbackDays || 90,
      minRangePercent: config.minRangePercent || 5,
      maxRangePercent: config.maxRangePercent || 30
    };
  }

  /**
   * Apply Wyckoff filter to a single stock
   */
  async apply(symbol: string): Promise<WyckoffResult | null> {
    try {
      // Get unified candles (handles timeframe conversion)
      const candles = await this.converter.getUnifiedCandles(
        symbol,
        this.config.timeframe,
        this.config.lookbackDays
      );

      if (candles.length < 50) {
        logger.debug(`${symbol}: Not enough candles (${candles.length})`);
        return null;
      }

      // Identify trading range
      const range = this.identifyTradingRange(candles);
      if (!range) {
        logger.debug(`${symbol}: No valid trading range`);
        return null;
      }

      // Check for Phase C (Spring)
      const phaseC = this.detectPhaseC(candles, range);
      if (phaseC && phaseC.confidence >= this.config.minConfidence) {
        return phaseC;
      }

      // Check for Phase D (SOS)
      const phaseD = this.detectPhaseD(candles, range);
      if (phaseD && phaseD.confidence >= this.config.minConfidence) {
        return phaseD;
      }

      return null;

    } catch (error) {
      logger.error(`Error applying Wyckoff filter to ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Identify trading range (consolidation zone)
   */
  private identifyTradingRange(candles: ConvertedCandle[]): {
    support: number;
    resistance: number;
    avgVolume: number;
  } | null {
    if (candles.length < 30) return null;

    const recentCandles = candles.slice(-60);
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    const volumes = recentCandles.map(c => c.volume);

    const support = Math.min(...lows);
    const resistance = Math.max(...highs);
    const rangePercent = ((resistance - support) / support) * 100;

    // Range must be reasonable
    if (rangePercent < this.config.minRangePercent || rangePercent > this.config.maxRangePercent) {
      return null;
    }

    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

    return { support, resistance, avgVolume };
  }

  /**
   * Detect Phase C: Spring (false breakdown + recovery)
   */
  private detectPhaseC(candles: ConvertedCandle[], range: any): WyckoffResult | null {
    const recentCandles = candles.slice(-30);
    const lastCandle = recentCandles[recentCandles.length - 1];

    let springDetected = false;
    let testDetected = false;
    let volumeIncrease = false;
    let springCandle: ConvertedCandle | null = null;

    // Look for spring in last 10 candles
    for (let i = recentCandles.length - 10; i < recentCandles.length - 2; i++) {
      const candle = recentCandles[i];
      const nextCandle = recentCandles[i + 1];

      // Spring: breaks support but closes above it
      if (candle.low < range.support * 0.98 && candle.close > range.support) {
        springDetected = true;
        springCandle = candle;

        // Test: next candles recover
        if (nextCandle.close > range.support && nextCandle.low > range.support * 0.99) {
          testDetected = true;
        }

        // Volume confirmation
        if (candle.volume > range.avgVolume * 1.5) {
          volumeIncrease = true;
        }
      }
    }

    if (!springDetected) return null;

    // Calculate confidence
    let confidence = 50;
    if (testDetected) confidence += 20;
    if (volumeIncrease) confidence += 15;
    if (lastCandle.close > range.support * 1.02) confidence += 15;

    return {
      symbol: lastCandle.symbol,
      phase: 'C',
      confidence,
      supportLevel: range.support,
      resistanceLevel: range.resistance,
      volume: lastCandle.volume,
      priceAction: `Spring at ${range.support.toFixed(2)}`,
      lastPrice: lastCandle.close,
      analysis: {
        spring: springDetected,
        test: testDetected,
        volumeIncrease: volumeIncrease
      },
      timestamp: lastCandle.timestamp,
      timeframe: this.config.timeframe
    };
  }

  /**
   * Detect Phase D: Sign of Strength (breakout above resistance)
   */
  private detectPhaseD(candles: ConvertedCandle[], range: any): WyckoffResult | null {
    const recentCandles = candles.slice(-20);
    const lastCandle = recentCandles[recentCandles.length - 1];

    let sosDetected = false;
    let backupDetected = false;
    let volumeIncrease = false;
    let rangeBreakout = false;

    // Look for SOS in last 10 candles
    for (let i = recentCandles.length - 10; i < recentCandles.length; i++) {
      const candle = recentCandles[i];

      // SOS: closes above resistance
      if (candle.close > range.resistance) {
        sosDetected = true;
        rangeBreakout = true;

        // Volume confirmation
        if (candle.volume > range.avgVolume * 1.3) {
          volumeIncrease = true;
        }
      }

      // Backup: pullback after SOS but holds above support
      if (sosDetected && i > 0) {
        const prevCandle = recentCandles[i - 1];
        if (prevCandle.close > range.resistance && candle.low > range.support * 1.02) {
          backupDetected = true;
        }
      }
    }

    if (!sosDetected) return null;

    // Calculate confidence
    let confidence = 60;
    if (volumeIncrease) confidence += 20;
    if (backupDetected) confidence += 10;
    if (lastCandle.close > range.resistance * 1.05) confidence += 10;

    return {
      symbol: lastCandle.symbol,
      phase: 'D',
      confidence,
      supportLevel: range.support,
      resistanceLevel: range.resistance,
      volume: lastCandle.volume,
      priceAction: `SOS at ${range.resistance.toFixed(2)}`,
      lastPrice: lastCandle.close,
      analysis: {
        sos: sosDetected,
        backup: backupDetected,
        volumeIncrease: volumeIncrease,
        rangeBreakout: rangeBreakout
      },
      timestamp: lastCandle.timestamp,
      timeframe: this.config.timeframe
    };
  }
}

export default WyckoffFilter;