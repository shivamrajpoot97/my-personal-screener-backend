import { Router, Request, Response } from 'express';
import ScreenerService from '../services/ScreenerService';
import { CacheService } from '../services/CacheService';
import { PreComputeService } from '../services/PreComputeService';
import { logger } from '../../../../shared/utils/logger';

const router = Router();

/**
 * POST /api/screener/scan
 * Run screener with caching
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const { filters, timeframe = '1day', limit = 100, useCache = true } = req.body;

    if (!filters || Object.keys(filters).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one filter must be specified'
      });
    }

    logger.info('Screener scan request:', { filters, timeframe, limit, useCache });

    // Try to get from cache first
    if (useCache) {
      const cached = await CacheService.getCachedResults('custom', filters, timeframe);
      
      if (cached) {
        return res.json({
          success: true,
          cached: true,
          results: cached.results,
          count: cached.results.length,
          metadata: cached.metadata,
          cacheAge: ((Date.now() - cached.metadata.lastUpdated.getTime()) / 1000 / 60).toFixed(0) + ' minutes'
        });
      }
    }

    // Run the scan
    logger.info('Cache miss or disabled, running fresh scan...');
    const startTime = Date.now();

    const screener = new ScreenerService({
      filters: { ...filters },
      stockLimit: limit,
      batchSize: 10
    });

    const results = await screener.scan();
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2) + 's';

    // Cache the results
    const resultsArray = results.filters.wyckoff || [];
    await CacheService.saveToCache(
      'custom',
      filters,
      timeframe,
      resultsArray,
      {
        totalStocks: results.totalScanned,
        matchedStocks: resultsArray.length,
        executionTime,
        dataDate: new Date()
      },
      24 // Cache for 24 hours
    );

    res.json({
      success: true,
      cached: false,
      results: resultsArray,
      count: resultsArray.length,
      metadata: {
        totalStocks: results.totalScanned,
        matchedStocks: resultsArray.length,
        executionTime,
        lastUpdated: new Date(),
        dataDate: new Date()
      }
    });

  } catch (error: any) {
    logger.error('Scan endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/screener/wyckoff
 * Quick Wyckoff scan with caching
 */
router.get('/wyckoff', async (req: Request, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as any) || '1day';
    const minConfidence = parseInt(req.query.confidence as string) || 70;
    const limit = parseInt(req.query.limit as string) || 100;
    const useCache = req.query.useCache !== 'false'; // Default to true
    const phase = req.query.phase as string; // Optional: filter by phase

    logger.info(`Wyckoff scan: timeframe=${timeframe}, confidence=${minConfidence}, useCache=${useCache}`);

    // Build filters
    const filters: any = { confidence: minConfidence };
    if (phase) {
      const phaseMap: any = {
        'A': 'Phase A (Stopping)',
        'B': 'Phase B (Building)',
        'C': 'Phase C (Test)',
        'D': 'Phase D (Markup)',
        'E': 'Phase E (Distribution)'
      };
      filters.wyckoffPhase = phaseMap[phase.toUpperCase()] || phase;
    }

    // Try cache first
    if (useCache) {
      const cached = await CacheService.getCachedResults('wyckoff', filters, timeframe);
      
      if (cached) {
        logger.info(`✅ Serving from cache: ${cached.results.length} results`);
        
        return res.json({
          success: true,
          cached: true,
          results: cached.results.slice(0, limit),
          count: cached.results.length,
          metadata: {
            ...cached.metadata,
            cacheAge: ((Date.now() - cached.metadata.lastUpdated.getTime()) / 1000 / 60).toFixed(0) + ' minutes'
          },
          tip: 'Results are served from cache. To force fresh scan, add ?useCache=false'
        });
      }
    }

    // Cache miss - run fresh scan
    logger.info('⚠️  Cache miss - running fresh Wyckoff scan (this may take time)...');
    const startTime = Date.now();

    const screener = new ScreenerService({
      filters: {
        wyckoff: {
          minConfidence,
          timeframe,
          lookbackDays: 90
        }
      },
      stockLimit: limit,
      batchSize: 10
    });

    const results = await screener.scan();
    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2) + 's';

    // Cache the results
    const resultsArray = results.filters.wyckoff || [];
    await CacheService.saveToCache(
      'wyckoff',
      filters,
      timeframe,
      resultsArray,
      {
        totalStocks: results.totalScanned,
        matchedStocks: resultsArray.length,
        executionTime,
        dataDate: new Date()
      },
      24
    );

    res.json({
      success: true,
      cached: false,
      results: resultsArray,
      count: resultsArray.length,
      phaseC: resultsArray.filter((r: any) => r.phase === 'C'),
      phaseD: resultsArray.filter((r: any) => r.phase === 'D'),
      metadata: {
        totalStocks: results.totalScanned,
        matchedStocks: resultsArray.length,
        executionTime,
        lastUpdated: new Date(),
        dataDate: new Date()
      },
      tip: 'Results have been cached. Next request will be instant!'
    });

  } catch (error: any) {
    logger.error('Wyckoff endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/screener/cache/precompute
 * Manually trigger pre-computation
 */
router.post('/cache/precompute', async (req: Request, res: Response) => {
  try {
    const { scanType = 'all' } = req.body;

    logger.info(`Manual pre-compute triggered: ${scanType}`);

    // Run in background
    PreComputeService.triggerManual(scanType).catch(error => {
      logger.error('Pre-compute failed:', error);
    });

    res.json({
      success: true,
      message: 'Pre-computation started in background',
      scanType
    });
  } catch (error: any) {
    logger.error('Pre-compute endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/screener/cache
 * Invalidate cache
 */
router.delete('/cache', async (req: Request, res: Response) => {
  try {
    const { scanType, timeframe } = req.query;

    const count = await CacheService.invalidateCache(
      scanType as any,
      timeframe as string
    );

    res.json({
      success: true,
      message: `Invalidated ${count} cache entries`,
      count
    });
  } catch (error: any) {
    logger.error('Cache invalidation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/screener/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', async (req: Request, res: Response) => {
  try {
    const stats = await CacheService.getCacheStats();

    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    logger.error('Cache stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/screener/filters
 * List available filters
 */
router.get('/filters', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      available: [
        {
          name: 'wyckoff',
          description: 'Wyckoff accumulation phases',
          parameters: {
            minConfidence: { type: 'number', default: 70, range: '0-100' },
            timeframe: { type: 'enum', default: '1day', options: ['15min', '1hour', '1day'] },
            phase: { type: 'enum', optional: true, options: ['A', 'B', 'C', 'D', 'E'] },
            lookbackDays: { type: 'number', default: 90, range: '30-365' }
          },
          caching: {
            enabled: true,
            ttl: '24 hours',
            precomputed: true,
            precomputeSchedule: '1 AM daily'
          }
        }
      ],
      cacheInfo: {
        enabled: true,
        defaultTTL: '24 hours',
        precomputeSchedule: 'Daily at 1 AM',
        cleanupSchedule: 'Daily at 2 AM',
        usage: 'Add ?useCache=false to force fresh scan'
      }
    }
  });
});

export default router;
