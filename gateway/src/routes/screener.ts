import { Router, Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../config/logger';

const router = Router();
const SCREENER_SERVICE_URL = process.env.SCREENER_SERVICE_URL || 'http://localhost:3003';

/**
 * GET /api/screener/wyckoff
 * Quick Wyckoff scan with query parameters
 */
router.get('/wyckoff', async (req: Request, res: Response) => {
  try {
    const { timeframe = '1day', confidence = '70', limit = '100' } = req.query;

    logger.info(`Gateway: Wyckoff scan request - timeframe=${timeframe}, confidence=${confidence}, limit=${limit}`);

    const response = await axios.get(
      `${SCREENER_SERVICE_URL}/api/screener/wyckoff`,
      {
        params: { timeframe, confidence, limit },
        timeout: 120000 // 2 minute timeout for large scans
      }
    );

    res.json(response.data);
  } catch (error: any) {
    logger.error('Gateway: Wyckoff scan failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Screener service unavailable',
        message: 'Please ensure the screener service is running on port 3003'
      });
    }

    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Screener service error',
      message: error.message
    });
  }
});

/**
 * POST /api/screener/scan
 * Custom scan with filters
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    logger.info('Gateway: Custom scan request:', JSON.stringify(req.body));

    const response = await axios.post(
      `${SCREENER_SERVICE_URL}/api/screener/scan`,
      req.body,
      {
        timeout: 180000 // 3 minute timeout
      }
    );

    res.json(response.data);
  } catch (error: any) {
    logger.error('Gateway: Custom scan failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Screener service unavailable'
      });
    }

    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || 'Screener service error'
    });
  }
});

/**
 * GET /api/screener/filters
 * List available filters
 */
router.get('/filters', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${SCREENER_SERVICE_URL}/api/screener/filters`);
    res.json(response.data);
  } catch (error: any) {
    logger.error('Gateway: Get filters failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Screener service unavailable'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch filters'
    });
  }
});

/**
 * GET /api/screener/health
 * Check screener service health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${SCREENER_SERVICE_URL}/health`, {
      timeout: 5000
    });
    res.json({
      success: true,
      screenerService: response.data
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      error: 'Screener service unavailable',
      details: error.message
    });
  }
});

export default router;