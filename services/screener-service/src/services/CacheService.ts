import crypto from 'crypto';
import { ScreenerCache, IScreenerCache } from '../models/ScreenerCache';
import { logger } from '../../../../shared/utils/logger';

export class CacheService {
  /**
   * Generate a unique cache key from filters and timeframe
   */
  static generateCacheKey(scanType: string, filters: any, timeframe: string): string {
    const normalizedFilters = JSON.stringify(filters, Object.keys(filters).sort());
    const data = `${scanType}:${timeframe}:${normalizedFilters}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Get cached results if available and not expired
   */
  static async getCachedResults(
    scanType: 'wyckoff' | 'custom',
    filters: any,
    timeframe: string
  ): Promise<IScreenerCache | null> {
    try {
      const cacheKey = this.generateCacheKey(scanType, filters, timeframe);
      
      const cached = await ScreenerCache.findOne({
        cacheKey,
        scanType,
        timeframe,
        expiresAt: { $gt: new Date() } // Not expired
      });

      if (cached) {
        logger.info(`✅ Cache HIT: ${cacheKey} (${cached.results.length} results)`);
        return cached;
      }

      logger.info(`❌ Cache MISS: ${cacheKey}`);
      return null;
    } catch (error) {
      logger.error('Error getting cached results:', error);
      return null;
    }
  }

  /**
   * Save scan results to cache
   */
  static async saveToCa che(
    scanType: 'wyckoff' | 'custom',
    filters: any,
    timeframe: string,
    results: any[],
    metadata: {
      totalStocks: number;
      matchedStocks: number;
      executionTime: string;
      dataDate: Date;
    },
    ttlHours: number = 24 // Cache for 24 hours by default
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(scanType, filters, timeframe);
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

      await ScreenerCache.findOneAndUpdate(
        { cacheKey },
        {
          cacheKey,
          scanType,
          filters,
          timeframe,
          results,
          metadata: {
            ...metadata,
            lastUpdated: new Date()
          },
          expiresAt
        },
        { upsert: true, new: true }
      );

      logger.info(`💾 Cached results: ${cacheKey} (${results.length} results, expires in ${ttlHours}h)`);
    } catch (error) {
      logger.error('Error saving to cache:', error);
    }
  }

  /**
   * Invalidate cache for specific scan type and timeframe
   */
  static async invalidateCache(
    scanType?: 'wyckoff' | 'custom',
    timeframe?: string
  ): Promise<number> {
    try {
      const query: any = {};
      if (scanType) query.scanType = scanType;
      if (timeframe) query.timeframe = timeframe;

      const result = await ScreenerCache.deleteMany(query);
      logger.info(`🗑️  Invalidated ${result.deletedCount} cache entries`);
      return result.deletedCount;
    } catch (error) {
      logger.error('Error invalidating cache:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  static async getCacheStats(): Promise<any> {
    try {
      const total = await ScreenerCache.countDocuments();
      const expired = await ScreenerCache.countDocuments({
        expiresAt: { $lt: new Date() }
      });
      const active = total - expired;

      const byType = await ScreenerCache.aggregate([
        { $match: { expiresAt: { $gt: new Date() } } },
        { $group: { _id: '$scanType', count: { $sum: 1 } } }
      ]);

      const byTimeframe = await ScreenerCache.aggregate([
        { $match: { expiresAt: { $gt: new Date() } } },
        { $group: { _id: '$timeframe', count: { $sum: 1 } } }
      ]);

      return {
        total,
        active,
        expired,
        byType: byType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byTimeframe: byTimeframe.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return null;
    }
  }

  /**
   * Check if cache needs refresh (older than threshold)
   */
  static async needsRefresh(
    scanType: 'wyckoff' | 'custom',
    filters: any,
    timeframe: string,
    maxAgeHours: number = 12
  ): Promise<boolean> {
    try {
      const cacheKey = this.generateCacheKey(scanType, filters, timeframe);
      
      const cached = await ScreenerCache.findOne({ cacheKey });
      if (!cached) return true;

      const ageMs = Date.now() - cached.metadata.lastUpdated.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);

      return ageHours >= maxAgeHours;
    } catch (error) {
      logger.error('Error checking cache refresh:', error);
      return true;
    }
  }

  /**
   * Cleanup old expired caches manually
   */
  static async cleanupExpired(): Promise<number> {
    try {
      const result = await ScreenerCache.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      
      if (result.deletedCount > 0) {
        logger.info(`🧹 Cleaned up ${result.deletedCount} expired cache entries`);
      }
      
      return result.deletedCount;
    } catch (error) {
      logger.error('Error cleaning up expired caches:', error);
      return 0;
    }
  }
}
