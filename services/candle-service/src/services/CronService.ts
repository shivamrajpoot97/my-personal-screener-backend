import * as cron from 'node-cron';
import { logger } from '@shared/utils/logger';
import CandleService from './CandleService';
import CandleConverterService from './CandleConverterService';

export class CronService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  
  /**
   * Initialize all cron jobs
   */
  init(): void {
    this.setupDailyConversionJobs();
    logger.info('Cron service initialized with all scheduled jobs');
  }
  
  /**
   * Setup daily conversion jobs
   */
  private setupDailyConversionJobs(): void {
    // Run 15min to 1hour conversion every day at 1:00 AM
    const job15minTo1hour = cron.schedule('0 1 * * *', async () => {
      logger.info('Starting daily 15min to 1hour conversion');
      await this.runDailyConversion('15min', '1hour');
    }, {
      scheduled: true,
      timezone: 'UTC'
    });
    
    this.jobs.set('15min-to-1hour', job15minTo1hour);
    
    // Run 1hour to 1day conversion every day at 2:00 AM
    const job1hourTo1day = cron.schedule('0 2 * * *', async () => {
      logger.info('Starting daily 1hour to 1day conversion');
      await this.runDailyConversion('1hour', '1day');
    }, {
      scheduled: true,
      timezone: 'UTC'
    });
    
    this.jobs.set('1hour-to-1day', job1hourTo1day);
    
    // Optional: Cleanup job to remove very old backup data (runs weekly)
    const cleanupJob = cron.schedule('0 3 * * 0', async () => {
      logger.info('Starting weekly backup cleanup');
      await this.cleanupOldBackups();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });
    
    this.jobs.set('weekly-cleanup', cleanupJob);
    
    logger.info('Daily conversion cron jobs scheduled');
  }
  
  /**
   * Run daily conversion for all symbols
   */
  private async runDailyConversion(
    fromTimeframe: '15min' | '1hour',
    toTimeframe: '1hour' | '1day'
  ): Promise<void> {
    try {
      // Get all symbols that have data in the source timeframe
      const availableData = await CandleService.getAvailableData();
      const symbolsToProcess = availableData
        .filter(data => data.timeframes.includes(fromTimeframe))
        .map(data => data.symbol);
      
      if (symbolsToProcess.length === 0) {
        logger.info(`No symbols found with ${fromTimeframe} data to convert`);
        return;
      }
      
      // Calculate the target date for conversion
      const targetDate = this.getConversionTargetDate(fromTimeframe);
      
      logger.info(`Processing ${fromTimeframe} to ${toTimeframe} conversion for ${symbolsToProcess.length} symbols on ${targetDate.toDateString()}`);
      
      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[]
      };
      
      // Process each symbol
      for (const symbol of symbolsToProcess) {
        try {
          await CandleConverterService.processConversion(
            symbol,
            fromTimeframe,
            toTimeframe,
            targetDate
          );
          results.success++;
          logger.info(`✓ Converted ${symbol} ${fromTimeframe} to ${toTimeframe}`);
        } catch (error) {
          results.failed++;
          const errorMsg = `Failed to convert ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          results.errors.push(errorMsg);
          logger.error(errorMsg, error);
        }
        
        // Add small delay to prevent overwhelming the database
        await this.delay(100);
      }
      
      // Log summary
      logger.info(`Conversion summary: ${results.success} successful, ${results.failed} failed`);
      if (results.errors.length > 0) {
        logger.error('Conversion errors:', results.errors);
      }
      
    } catch (error) {
      logger.error(`Error in daily conversion ${fromTimeframe} to ${toTimeframe}:`, error);
    }
  }
  
  /**
   * Get the target date for conversion based on retention policy
   */
  private getConversionTargetDate(fromTimeframe: '15min' | '1hour'): Date {
    const now = new Date();
    const targetDate = new Date(now);
    
    if (fromTimeframe === '15min') {
      // Convert 15min data that is 30 days old
      targetDate.setDate(now.getDate() - 30);
    } else if (fromTimeframe === '1hour') {
      // Convert 1hour data that is 6 months old
      targetDate.setMonth(now.getMonth() - 6);
    }
    
    // Set to start of day
    targetDate.setHours(0, 0, 0, 0);
    
    return targetDate;
  }
  
  /**
   * Manual trigger for conversion (useful for testing or catch-up)
   */
  async triggerConversion(
    fromTimeframe: '15min' | '1hour',
    toTimeframe: '1hour' | '1day',
    symbol?: string,
    date?: Date
  ): Promise<void> {
    try {
      if (symbol && date) {
        // Convert specific symbol and date
        await CandleConverterService.processConversion(symbol, fromTimeframe, toTimeframe, date);
        logger.info(`Manual conversion completed for ${symbol} on ${date.toDateString()}`);
      } else {
        // Run full daily conversion
        await this.runDailyConversion(fromTimeframe, toTimeframe);
        logger.info(`Manual daily conversion completed for ${fromTimeframe} to ${toTimeframe}`);
      }
    } catch (error) {
      logger.error('Error in manual conversion trigger:', error);
      throw error;
    }
  }
  
  /**
   * Cleanup old backup data (older than 2 years)
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      // The TTL index should handle this automatically, but we can add manual cleanup if needed
      logger.info('Backup cleanup completed (handled by TTL indexes)');
    } catch (error) {
      logger.error('Error in backup cleanup:', error);
    }
  }
  
  /**
   * Stop a specific cron job
   */
  stopJob(jobName: string): boolean {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      logger.info(`Stopped cron job: ${jobName}`);
      return true;
    }
    return false;
  }
  
  /**
   * Start a specific cron job
   */
  startJob(jobName: string): boolean {
    const job = this.jobs.get(jobName);
    if (job) {
      job.start();
      logger.info(`Started cron job: ${jobName}`);
      return true;
    }
    return false;
  }
  
  /**
   * Stop all cron jobs
   */
  stopAllJobs(): void {
    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info(`Stopped cron job: ${name}`);
    });
  }
  
  /**
   * Get status of all jobs
   */
  getJobsStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    this.jobs.forEach((job, name) => {
      status[name] = job.getStatus() === 'scheduled';
    });
    return status;
  }
  
  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new CronService();
</contents>