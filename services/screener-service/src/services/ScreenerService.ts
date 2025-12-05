import { Stock } from '../../../../shared/models';
import { logger } from '../../../../shared/utils/logger';
import WyckoffFilter, { WyckoffResult, WyckoffFilterConfig } from './WyckoffFilter';

export interface ScreenerConfig {
  filters: {
    wyckoff?: WyckoffFilterConfig;
    // Future filters can be added here:
    // momentum?: MomentumFilterConfig;
    // breakout?: BreakoutFilterConfig;
    // rsi?: RSIFilterConfig;
  };
  stockLimit?: number;
  batchSize?: number;
}

export interface ScreenerResults {
  timestamp: Date;
  totalScanned: number;
  totalMatched: number;
  filters: {
    wyckoff?: WyckoffResult[];
    // Future filter results:
    // momentum?: MomentumResult[];
    // breakout?: BreakoutResult[];
  };
  duration: number;
}

/**
 * ScreenerService - Main screening engine
 * Applies multiple filters to stocks and returns combined results
 */
class ScreenerService {
  private config: ScreenerConfig;

  constructor(config: ScreenerConfig) {
    this.config = config;
  }

  /**
   * Run the screener with all configured filters
   */
  async scan(): Promise<ScreenerResults> {
    const startTime = Date.now();
    
    logger.info('🔍 Starting screener scan...');
    logger.info(`Filters enabled: ${Object.keys(this.config.filters).join(', ')}`);

    try {
      // Get all active equity stocks
      const stocks = await this.getStocks();
      logger.info(`Found ${stocks.length} stocks to scan`);

      const results: ScreenerResults = {
        timestamp: new Date(),
        totalScanned: 0,
        totalMatched: 0,
        filters: {},
        duration: 0
      };

      // Apply Wyckoff filter if enabled
      if (this.config.filters.wyckoff) {
        logger.info('\n📊 Running Wyckoff filter...');
        const wyckoffResults = await this.runWyckoffFilter(stocks, this.config.filters.wyckoff);
        results.filters.wyckoff = wyckoffResults;
        results.totalMatched += wyckoffResults.length;
        logger.info(`✅ Wyckoff filter found ${wyckoffResults.length} matches`);
      }

      // Future filters can be added here:
      // if (this.config.filters.momentum) {
      //   const momentumResults = await this.runMomentumFilter(stocks, this.config.filters.momentum);
      //   results.filters.momentum = momentumResults;
      // }

      results.totalScanned = stocks.length;
      results.duration = (Date.now() - startTime) / 1000;

      logger.info(`\n✅ Scan complete: ${results.totalMatched} matches in ${results.duration.toFixed(2)}s`);

      return results;

    } catch (error) {
      logger.error('Screener scan failed:', error);
      throw error;
    }
  }

  /**
   * Get stocks to scan
   */
  private async getStocks(): Promise<any[]> {
    const limit = this.config.stockLimit || 100; // Default to 100 for testing

    const stocks = await Stock.find({
      instrumentType: 'EQ',
      isActive: true,
      instrumentKey: { $exists: true, $ne: null }
    })
    .select('symbol instrumentKey name')
    .limit(limit);

    return stocks;
  }

  /**
   * Run Wyckoff filter on all stocks
   */
  private async runWyckoffFilter(
    stocks: any[],
    config: WyckoffFilterConfig
  ): Promise<WyckoffResult[]> {
    const wyckoffFilter = new WyckoffFilter(config);
    const results: WyckoffResult[] = [];
    const batchSize = this.config.batchSize || 10;

    let processed = 0;

    // Process in batches
    for (let i = 0; i < stocks.length; i += batchSize) {
      const batch = stocks.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(stock => 
        wyckoffFilter.apply(stock.symbol)
          .catch(error => {
            logger.error(`Error processing ${stock.symbol}:`, error);
            return null;
          })
      );

      const batchResults = await Promise.all(batchPromises);
      
      // Filter out nulls and add to results
      for (const result of batchResults) {
        if (result) {
          results.push(result);
        }
      }

      processed += batch.length;
      
      if (processed % 50 === 0) {
        logger.info(`Progress: ${processed}/${stocks.length} stocks scanned`);
      }
    }

    return results;
  }

  /**
   * Get results summary
   */
  static formatResults(results: ScreenerResults): string {
    let output = '';
    output += '\n' + '='.repeat(80) + '\n';
    output += '🎯 SCREENER RESULTS\n';
    output += '='.repeat(80) + '\n';
    output += `Timestamp: ${results.timestamp.toISOString()}\n`;
    output += `Total Scanned: ${results.totalScanned}\n`;
    output += `Total Matched: ${results.totalMatched}\n`;
    output += `Duration: ${results.duration.toFixed(2)}s\n`;
    output += '\n';

    // Wyckoff results
    if (results.filters.wyckoff && results.filters.wyckoff.length > 0) {
      const phaseC = results.filters.wyckoff.filter(r => r.phase === 'C');
      const phaseD = results.filters.wyckoff.filter(r => r.phase === 'D');

      output += `📊 Wyckoff Filter: ${results.filters.wyckoff.length} matches\n`;
      output += '-'.repeat(80) + '\n';

      if (phaseC.length > 0) {
        output += `\n🔵 Phase C (Spring): ${phaseC.length} stocks\n`;
        phaseC.forEach(r => {
          output += `  • ${r.symbol.padEnd(25)} | Price: ₹${r.lastPrice.toFixed(2).padStart(8)} | `;
          output += `Support: ₹${r.supportLevel.toFixed(2).padStart(8)} | Confidence: ${r.confidence}%\n`;
        });
      }

      if (phaseD.length > 0) {
        output += `\n🟢 Phase D (SOS): ${phaseD.length} stocks\n`;
        phaseD.forEach(r => {
          output += `  • ${r.symbol.padEnd(25)} | Price: ₹${r.lastPrice.toFixed(2).padStart(8)} | `;
          output += `Resistance: ₹${r.resistanceLevel.toFixed(2).padStart(8)} | Confidence: ${r.confidence}%\n`;
        });
      }
    }

    output += '\n' + '='.repeat(80) + '\n';

    return output;
  }
}

export default ScreenerService;