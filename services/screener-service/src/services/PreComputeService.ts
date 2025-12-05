import cron from 'node-cron';
import { logger } from '../../../../shared/utils/logger';
import { CacheService } from './CacheService';
import { WyckoffFilter } from '../filters/WyckoffFilter';
import { Stock } from '../../../../shared/models';

/**
 * Service to pre-compute and cache screener results daily
 */
export class PreComputeService {
  private static jobs: Map<string, cron.ScheduledTask> = new Map();

  /**
   * Initialize all pre-compute jobs
   */
  static initialize() {
    logger.info('🔄 Initializing pre-compute jobs...');

    // Daily pre-compute at 1 AM
    this.scheduleJob(
      'daily-wyckoff',
      '0 1 * * *', // 1 AM every day
      () => this.preComputeWyckoff()
    );

    // Cleanup expired caches at 2 AM
    this.scheduleJob(
      'cleanup-cache',
      '0 2 * * *', // 2 AM every day
      () => CacheService.cleanupExpired()
    );

    logger.info('✅ Pre-compute jobs initialized');
  }

  /**
   * Schedule a cron job
   */
  private static scheduleJob(name: string, schedule: string, task: () => Promise<any>) {
    const job = cron.schedule(schedule, async () => {
      logger.info(`⏰ Running scheduled job: ${name}`);
      const startTime = Date.now();
      
      try {
        await task();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`✅ Job completed: ${name} (${duration}s)`);
      } catch (error) {
        logger.error(`❌ Job failed: ${name}`, error);
      }
    });

    this.jobs.set(name, job);
    logger.info(`📅 Scheduled job: ${name} - ${schedule}`);
  }

  /**
   * Pre-compute Wyckoff scans for common configurations
   */
  static async preComputeWyckoff(): Promise<void> {
    logger.info('🔍 Starting Wyckoff pre-computation...');

    const timeframes = ['15min', '1hour', '1day'];
    const confidenceLevels = [60, 70, 80];
    const phases = [
      'Phase A (Stopping)',
      'Phase B (Building)',
      'Phase C (Test)',
      'Phase D (Markup)',
      'Phase E (Distribution)'
    ];

    let totalComputed = 0;
    const startTime = Date.now();

    for (const timeframe of timeframes) {
      for (const confidence of confidenceLevels) {
        for (const phase of phases) {
          try {
            logger.info(`Computing: ${timeframe} - ${phase} - confidence=${confidence}`);

            // Run the scan
            const filters = { wyckoffPhase: phase };
            const results = await this.runWyckoffScan(timeframe, confidence, filters);

            // Cache the results
            await CacheService.saveToCache(
              'wyckoff',
              { wyckoffPhase: phase, confidence },
              timeframe,
              results,
              {
                totalStocks: results.length,
                matchedStocks: results.length,
                executionTime: '0s',
                dataDate: new Date()
              },
              24 // Cache for 24 hours
            );

            totalComputed++;
            logger.info(`✅ Cached: ${results.length} results for ${phase} - ${timeframe}`);

          } catch (error) {
            logger.error(`Error computing ${timeframe} - ${phase}:`, error);
          }

          // Small delay to prevent overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    logger.info(`✅ Wyckoff pre-computation completed: ${totalComputed} scans in ${duration} minutes`);
  }

  /**
   * Run Wyckoff scan (actual scanning logic)
   */
  private static async runWyckoffScan(
    timeframe: string,
    confidence: number,
    filters: any
  ): Promise<any[]> {
    try {
      // Get all active stocks
      const stocks = await Stock.find({
        instrumentType: 'EQ',
        isActive: true
      }).select('symbol name exchange');

      logger.info(`Scanning ${stocks.length} stocks for Wyckoff patterns...`);

      // Run Wyckoff filter
      const wyckoffFilter = new WyckoffFilter();
      const results = await wyckoffFilter.filter(stocks, timeframe, filters);

      return results;
    } catch (error) {
      logger.error('Error running Wyckoff scan:', error);
      return [];
    }
  }

  /**
   * Manually trigger pre-computation
   */
  static async triggerManual(scanType: 'wyckoff' | 'all' = 'all'): Promise<void> {
    logger.info(`🔄 Manually triggering pre-computation: ${scanType}`);

    if (scanType === 'wyckoff' || scanType === 'all') {
      await this.preComputeWyckoff();
    }

    logger.info('✅ Manual pre-computation completed');
  }

  /**
   * Stop all cron jobs
   */
  static stopAll() {
    logger.info('Stopping all pre-compute jobs...');
    
    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info(`Stopped job: ${name}`);
    });

    this.jobs.clear();
    logger.info('All pre-compute jobs stopped');
  }

  /**
   * Get job status
   */
  static getStatus() {
    const jobs: any[] = [];
    
    this.jobs.forEach((job, name) => {
      jobs.push({
        name,
        running: true // cron jobs don't expose running status
      });
    });

    return {
      totalJobs: this.jobs.size,
      jobs
    };
  }
}
