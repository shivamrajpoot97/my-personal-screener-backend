import { Router, Request, Response } from 'express';
import ScreenerService from '../services/ScreenerService';
import { logger } from '../../../../shared/utils/logger';

const router = Router();

/**
 * POST /api/screener/scan
 * Run screener with specified filters
 * 
 * Body:
 * {
 *   filters: {
 *     wyckoff?: {
 *       minConfidence?: number,
 *       timeframe?: '15min' | '1hour' | '1day',
 *       lookbackDays?: number
 *     }
 *   },
 *   stockLimit?: number,
 *   batchSize?: number
 * }
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const config = req.body;

    // Validate config
    if (!config.filters || Object.keys(config.filters).length === 0) {
      return res.status(400).json({
        error: 'At least one filter must be specified'
      });
    }

    logger.info('Starting screener scan with config:', JSON.stringify(config, null, 2));

    const screener = new ScreenerService(config);
    const results = await screener.scan();

    res.json({
      success: true,
      data: results
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
 * Quick Wyckoff scan with default parameters
 * 
 * Query params:
 * - timeframe: '15min' | '1hour' | '1day' (default: '1day')
 * - confidence: minimum confidence % (default: 70)
 * - limit: max stocks to scan (default: 100)
 */
router.get('/wyckoff', async (req: Request, res: Response) => {
  try {
    const timeframe = (req.query.timeframe as any) || '1day';
    const minConfidence = parseInt(req.query.confidence as string) || 70;
    const stockLimit = parseInt(req.query.limit as string) || 100;

    logger.info(`Wyckoff scan: timeframe=${timeframe}, confidence=${minConfidence}, limit=${stockLimit}`);

    const screener = new ScreenerService({
      filters: {
        wyckoff: {
          minConfidence,
          timeframe,
          lookbackDays: 90
        }
      },
      stockLimit,
      batchSize: 10
    });

    const results = await screener.scan();

    res.json({
      success: true,
      data: {
        timestamp: results.timestamp,
        totalScanned: results.totalScanned,
        matches: results.filters.wyckoff || [],
        phaseC: results.filters.wyckoff?.filter(r => r.phase === 'C') || [],
        phaseD: results.filters.wyckoff?.filter(r => r.phase === 'D') || [],
        duration: results.duration
      }
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
 * GET /api/screener/filters
 * List available filters and their configurations
 */
router.get('/filters', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      available: [
        {
          name: 'wyckoff',
          description: 'Wyckoff accumulation Phase C (Spring) and Phase D (SOS)',
          parameters: {
            minConfidence: { type: 'number', default: 70, range: '0-100' },
            timeframe: { type: 'enum', default: '1day', options: ['15min', '1hour', '1day'] },
            lookbackDays: { type: 'number', default: 90, range: '30-365' }
          }
        }
        // Future filters will be listed here
      ]
    }
  });
});

export default router;