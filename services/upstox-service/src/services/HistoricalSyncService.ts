import cron from 'node-cron';
import { logger } from '@shared/utils/logger';
import { Stock } from '@shared/models';
import UpstoxService from './UpstoxService';
import { UPSTOX_INTERVALS } from '../types/upstox';

export class HistoricalSyncService {
  private upstoxService: UpstoxService;
  private isRunning = false;

  constructor(upstoxService: UpstoxService) {
    this.upstoxService = upstoxService;
  }

  // Schedule incremental sync every 15 minutes during market hours
  public startScheduledSync(): void {
    // Run every 15 minutes from 9:15 AM to 3:30 PM on weekdays
    cron.schedule('*/15 9-15 * * 1-5', async () => {
      if (this.isMarketHours()) {
        await this.runIncrementalSync();
      }
    });

    // Run daily sync at 6 PM on weekdays for any missed data
    cron.schedule('0 18 * * 1-5', async () => {
      await this.runIncrementalSync();
    });

    logger.info('Historical sync scheduler started');
  }

  private isMarketHours(): boolean {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    
    // Monday to Friday
    if (day >= 1 && day <= 5) {
      // 9:15 AM to 3:30 PM
      const marketStart = 9 * 60 + 15; // 9:15 AM
      const marketEnd = 15 * 60 + 30;   // 3:30 PM
      return totalMinutes >= marketStart && totalMinutes <= marketEnd;
    }
    
    return false;
  }

  // Manual incremental sync (admin only)
  public async runIncrementalSync(): Promise<{ success: boolean; message: string; stats: any }> {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Sync already in progress',
        stats: null
      };
    }

    this.isRunning = true;
    const stats = {
      totalStocks: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      startTime: new Date(),
      endTime: null as Date | null,
      errors: [] as string[]
    };

    try {
      logger.info('Starting incremental historical data sync');
      
      const equityStocks = await Stock.find({
        instrumentType: 'EQ',
        isActive: true,
        instrumentKey: { $exists: true, $ne: null }
      }).select('symbol instrumentKey name');

      stats.totalStocks = equityStocks.length;
      logger.info(`Found ${stats.totalStocks} equity stocks for sync`);

      // Process in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < equityStocks.length; i += batchSize) {
        const batch = equityStocks.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (stock) => {
            try {
              await this.syncStockIncrementalData(stock.symbol);
              stats.successfulSyncs++;
              logger.debug(`Successfully synced ${stock.symbol}`);
            } catch (error) {
              stats.failedSyncs++;
              const errorMsg = `Failed to sync ${stock.symbol}: ${error}`;
              stats.errors.push(errorMsg);
              logger.error(errorMsg);
            }
          })
        );

        // Rate limiting - wait between batches
        if (i + batchSize < equityStocks.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      stats.endTime = new Date();
      const duration = stats.endTime.getTime() - stats.startTime.getTime();
      
      logger.info(`Incremental sync completed. Success: ${stats.successfulSyncs}, Failed: ${stats.failedSyncs}, Duration: ${duration}ms`);

      return {
        success: true,
        message: `Sync completed. ${stats.successfulSyncs}/${stats.totalStocks} stocks synced successfully`,
        stats
      };

    } catch (error) {
      stats.endTime = new Date();
      const errorMessage = `Incremental sync failed: ${error}`;
      logger.error(errorMessage);
      
      return {
        success: false,
        message: errorMessage,
        stats
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async syncStockIncrementalData(symbol: string): Promise<void> {
    try {
      // Get the last candle for this stock
      const { Candle } = await import('@shared/models');
      
      const lastCandle = await Candle.findOne({
        symbol,
        timeframe: '15min'
      }).sort({ timestamp: -1 });

      // Determine the start date for sync
      let fromDate: Date;
      if (lastCandle) {
        // Start from the next 15-minute interval after the last candle
        fromDate = new Date(lastCandle.timestamp.getTime() + 15 * 60 * 1000);
      } else {
        // If no data exists, start from 30 days ago
        fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      const toDate = new Date();

      // Skip if no new data is needed
      if (fromDate >= toDate) {
        logger.debug(`No new data needed for ${symbol}`);
        return;
      }

      // Sync 15min data
      await this.upstoxService.syncEquityHistoricalData(
        symbol,
        UPSTOX_INTERVALS['15min'],
        fromDate,
        toDate
      );

      logger.debug(`Incremental sync completed for ${symbol}`);

    } catch (error) {
      logger.error(`Error in incremental sync for ${symbol}:`, error);
      throw error;
    }
  }

  // Get sync status
  public getSyncStatus(): { isRunning: boolean; lastRun?: Date } {
    return {
      isRunning: this.isRunning,
      // Could store last run time in Redis or database
    };
  }

  // Force stop sync (emergency)
  public forceStopSync(): void {
    this.isRunning = false;
    logger.warn('Sync forcefully stopped');
  }
}

export default HistoricalSyncService;