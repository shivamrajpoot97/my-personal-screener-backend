#!/usr/bin/env ts-node

import 'dotenv/config';
import { SharedDatabase, ClickHouseDatabase } from '../../shared/database';
import { logger } from '../../shared/utils/logger';
import { Stock } from '../../shared/models';
import { ClickHouseCandle } from '../../shared/models';

interface WyckoffPhase {
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
}

class WyckoffScanner {
  private candleModel: ClickHouseCandle;

  constructor() {
    this.candleModel = new ClickHouseCandle();
  }

  async scan(timeframe: string = '1day', lookbackDays: number = 90): Promise<WyckoffPhase[]> {
    try {
      logger.info(`Starting Wyckoff scan - timeframe: ${timeframe}, lookback: ${lookbackDays} days`);

      const stocks = await Stock.find({
        instrumentType: 'EQ',
        isActive: true,
        instrumentKey: { $exists: true, $ne: null }
      }).select('symbol').limit(50); // Test with 50 stocks

      logger.info(`Found ${stocks.length} stocks to analyze`);

      const results: WyckoffPhase[] = [];
      let processed = 0;

      for (const stock of stocks) {
        try {
          processed++;
          if (processed % 10 === 0) {
            logger.info(`Progress: ${processed}/${stocks.length}`);
          }

          const phase = await this.analyzeStock(stock.symbol, timeframe, lookbackDays);
          
          if (phase && phase.confidence >= 70) {
            results.push(phase);
            logger.info(`✅ Found Phase ${phase.phase} in ${stock.symbol} - Confidence: ${phase.confidence}%`);
          }

        } catch (error) {
          logger.error(`Error analyzing ${stock.symbol}:`, error);
        }
      }

      return results;

    } catch (error) {
      logger.error('Wyckoff scan failed:', error);
      throw error;
    }
  }

  private async analyzeStock(symbol: string, timeframe: string, lookbackDays: number): Promise<WyckoffPhase | null> {
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const candles = await this.candleModel.getCandlesInRange(symbol, timeframe, fromDate, toDate);

    if (candles.length < 50) return null;

    const range = this.identifyTradingRange(candles);
    if (!range) return null;

    const phaseC = this.detectPhaseC(candles, range);
    if (phaseC) return phaseC;

    const phaseD = this.detectPhaseD(candles, range);
    if (phaseD) return phaseD;

    return null;
  }

  private identifyTradingRange(candles: any[]) {
    const recentCandles = candles.slice(-60);
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    const volumes = recentCandles.map(c => c.volume);

    const support = Math.min(...lows);
    const resistance = Math.max(...highs);
    const rangePercent = ((resistance - support) / support) * 100;

    if (rangePercent < 5 || rangePercent > 30) return null;

    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    return { support, resistance, avgVolume };
  }

  private detectPhaseC(candles: any[], range: any): WyckoffPhase | null {
    const recentCandles = candles.slice(-30);
    const lastCandle = recentCandles[recentCandles.length - 1];

    let springDetected = false;
    let testDetected = false;
    let volumeIncrease = false;

    for (let i = recentCandles.length - 10; i < recentCandles.length - 2; i++) {
      const candle = recentCandles[i];
      const nextCandle = recentCandles[i + 1];

      if (candle.low < range.support * 0.98 && candle.close > range.support) {
        springDetected = true;
        if (nextCandle.close > range.support && nextCandle.low > range.support * 0.99) {
          testDetected = true;
        }
        if (candle.volume > range.avgVolume * 1.5) {
          volumeIncrease = true;
        }
      }
    }

    if (!springDetected) return null;

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
      analysis: { spring: springDetected, test: testDetected, volumeIncrease },
      timestamp: lastCandle.timestamp
    };
  }

  private detectPhaseD(candles: any[], range: any): WyckoffPhase | null {
    const recentCandles = candles.slice(-20);
    const lastCandle = recentCandles[recentCandles.length - 1];

    let sosDetected = false;
    let backupDetected = false;
    let volumeIncrease = false;

    for (let i = recentCandles.length - 10; i < recentCandles.length; i++) {
      const candle = recentCandles[i];

      if (candle.close > range.resistance) {
        sosDetected = true;
        if (candle.volume > range.avgVolume * 1.3) {
          volumeIncrease = true;
        }
      }

      if (sosDetected && i > 0) {
        const prevCandle = recentCandles[i - 1];
        if (prevCandle.close > range.resistance && candle.low > range.support * 1.02) {
          backupDetected = true;
        }
      }
    }

    if (!sosDetected) return null;

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
      analysis: { sos: sosDetected, backup: backupDetected, volumeIncrease, rangeBreakout: true },
      timestamp: lastCandle.timestamp
    };
  }
}

async function main() {
  try {
    await SharedDatabase.getInstance().connect('wyckoff-scanner');
    logger.info('✅ Connected to MongoDB');
    
    await ClickHouseDatabase.getInstance().connect('wyckoff-scanner');
    logger.info('✅ Connected to ClickHouse');

    const scanner = new WyckoffScanner();
    const results = await scanner.scan('1day', 90);

    console.log('\n' + '='.repeat(80));
    console.log('🎯 WYCKOFF ANALYSIS RESULTS');
    console.log('='.repeat(80));
    console.log(`Total stocks in Phase C/D: ${results.length}\n`);

    const phaseC = results.filter(r => r.phase === 'C');
    const phaseD = results.filter(r => r.phase === 'D');

    console.log(`📊 Phase C (Spring): ${phaseC.length} stocks`);
    phaseC.forEach(r => {
      console.log(`  ${r.symbol}: ${r.priceAction} | Price: ${r.lastPrice.toFixed(2)} | Confidence: ${r.confidence}%`);
    });

    console.log(`\n📈 Phase D (SOS): ${phaseD.length} stocks`);
    phaseD.forEach(r => {
      console.log(`  ${r.symbol}: ${r.priceAction} | Price: ${r.lastPrice.toFixed(2)} | Confidence: ${r.confidence}%`);
    });

    console.log('\n' + '='.repeat(80));
    process.exit(0);

  } catch (error) {
    logger.error('Scanner failed:', error);
    process.exit(1);
  }
}

main();