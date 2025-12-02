import express from 'express';
import { logger } from '@shared/utils/logger';
import CandleService from '../services/CandleService';
import CronService from '../services/CronService';
import { ICandleData, ICandleFeaturesData } from '@shared/models';

const router = express.Router();

/**
 * Store single candle with optional features
 * POST /api/candles
 */
router.post('/', async (req, res) => {
  try {
    const { candleData, featuresData } = req.body;
    
    if (!candleData) {
      return res.status(400).json({ error: 'candleData is required' });
    }
    
    const result = await CandleService.storeCandle(candleData, featuresData);
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error storing candle:', error);
    res.status(500).json({
      error: 'Failed to store candle',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Store multiple candles in batch
 * POST /api/candles/batch
 */
router.post('/batch', async (req, res) => {
  try {
    const { candlesData, featuresData } = req.body;
    
    if (!Array.isArray(candlesData) || candlesData.length === 0) {
      return res.status(400).json({ error: 'candlesData must be a non-empty array' });
    }
    
    const result = await CandleService.storeCandlesBatch(candlesData, featuresData);
    
    res.status(201).json({
      success: true,
      data: {
        stored: result.candles.length,
        candles: result.candles,
        features: result.features
      }
    });
  } catch (error) {
    logger.error('Error storing candles batch:', error);
    res.status(500).json({
      error: 'Failed to store candles batch',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Query candles
 * GET /api/candles
 */
router.get('/', async (req, res) => {
  try {
    const {
      symbol,
      timeframe,
      from,
      to,
      limit,
      includeFeatures
    } = req.query;
    
    const query = {
      symbol: symbol as string,
      timeframe: timeframe as string,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      includeFeatures: includeFeatures === 'true'
    };
    
    const candles = await CandleService.getCandles(query);
    
    res.json({
      success: true,
      count: candles.length,
      data: candles
    });
  } catch (error) {
    logger.error('Error querying candles:', error);
    res.status(500).json({
      error: 'Failed to query candles',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get latest candle for a symbol and timeframe
 * GET /api/candles/latest/:symbol/:timeframe
 */
router.get('/latest/:symbol/:timeframe', async (req, res) => {
  try {
    const { symbol, timeframe } = req.params;
    const { includeFeatures } = req.query;
    
    const candle = await CandleService.getLatestCandle(symbol, timeframe);
    
    if (!candle) {
      return res.status(404).json({
        success: false,
        message: `No candle found for ${symbol} ${timeframe}`
      });
    }
    
    res.json({
      success: true,
      data: candle
    });
  } catch (error) {
    logger.error('Error getting latest candle:', error);
    res.status(500).json({
      error: 'Failed to get latest candle',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get available symbols and timeframes
 * GET /api/candles/available
 */
router.get('/available', async (req, res) => {
  try {
    const data = await CandleService.getAvailableData();
    
    res.json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    logger.error('Error getting available data:', error);
    res.status(500).json({
      error: 'Failed to get available data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Manual conversion trigger
 * POST /api/candles/convert
 */
router.post('/convert', async (req, res) => {
  try {
    const {
      fromTimeframe,
      toTimeframe,
      symbol,
      date
    } = req.body;
    
    // Validate timeframes
    if (!fromTimeframe || !toTimeframe) {
      return res.status(400).json({ error: 'fromTimeframe and toTimeframe are required' });
    }
    
    const validConversions = [
      { from: '15min', to: '1hour' },
      { from: '1hour', to: '1day' }
    ];
    
    const isValidConversion = validConversions.some(
      conv => conv.from === fromTimeframe && conv.to === toTimeframe
    );
    
    if (!isValidConversion) {
      return res.status(400).json({ 
        error: 'Invalid conversion. Supported: 15min->1hour, 1hour->1day' 
      });
    }
    
    // Parse date if provided
    const targetDate = date ? new Date(date) : undefined;
    
    await CronService.triggerConversion(
      fromTimeframe,
      toTimeframe,
      symbol,
      targetDate
    );
    
    res.json({
      success: true,
      message: `Conversion triggered: ${fromTimeframe} to ${toTimeframe}${symbol ? ` for ${symbol}` : ''}${targetDate ? ` on ${targetDate.toDateString()}` : ''}`
    });
  } catch (error) {
    logger.error('Error triggering conversion:', error);
    res.status(500).json({
      error: 'Failed to trigger conversion',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get cron jobs status
 * GET /api/candles/cron/status
 */
router.get('/cron/status', (req, res) => {
  try {
    const status = CronService.getJobsStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Error getting cron status:', error);
    res.status(500).json({
      error: 'Failed to get cron status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Control cron jobs
 * POST /api/candles/cron/:action/:jobName
 */
router.post('/cron/:action/:jobName', (req, res) => {
  try {
    const { action, jobName } = req.params;
    
    if (!['start', 'stop'].includes(action)) {
      return res.status(400).json({ error: 'Action must be start or stop' });
    }
    
    let success = false;
    if (action === 'start') {
      success = CronService.startJob(jobName);
    } else {
      success = CronService.stopJob(jobName);
    }
    
    if (!success) {
      return res.status(404).json({ error: `Job ${jobName} not found` });
    }
    
    res.json({
      success: true,
      message: `Job ${jobName} ${action}ed successfully`
    });
  } catch (error) {
    logger.error('Error controlling cron job:', error);
    res.status(500).json({
      error: 'Failed to control cron job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Parse Upstox candle data
 * POST /api/candles/parse-upstox
 */
router.post('/parse-upstox', async (req, res) => {
  try {
    const { symbol, timeframe, candleArray, featuresData } = req.body;
    
    if (!symbol || !timeframe || !Array.isArray(candleArray)) {
      return res.status(400).json({ 
        error: 'symbol, timeframe, and candleArray are required' 
      });
    }
    
    // Parse candle data using the static method
    const { Candle } = await import('@shared/models');
    const parsedCandle = (Candle as any).parseUpstoxCandle(symbol, timeframe, candleArray);
    
    // Store the parsed candle
    const result = await CandleService.storeCandle(parsedCandle, featuresData);
    
    res.status(201).json({
      success: true,
      data: {
        parsed: parsedCandle,
        stored: result
      }
    });
  } catch (error) {
    logger.error('Error parsing Upstox candle:', error);
    res.status(500).json({
      error: 'Failed to parse Upstox candle',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;