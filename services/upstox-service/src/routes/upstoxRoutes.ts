import express, { Request, Response } from 'express';
import { logger } from '@shared/utils/logger';
import UpstoxService from '../services/UpstoxService';
import HistoricalSyncService from '../services/HistoricalSyncService';
import { Stock } from '@shared/models';

const router = express.Router();

// Initialize services
const upstoxService = new UpstoxService();
const historicalSyncService = new HistoricalSyncService(upstoxService);

// Middleware to check admin role
const requireAdmin = (req: Request, res: Response, next: any) => {
  // This should integrate with your auth service
  // For now, we'll check a header or token
  const userRole = req.headers['x-user-role'] as string;
  
  if (userRole !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  
  next();
};

// Health check
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Upstox service is running',
    timestamp: new Date().toISOString(),
    status: {
      sync: historicalSyncService.getSyncStatus()
    }
  });
});

// Admin Routes

// 1. Manual incremental sync (Admin only)
router.post('/admin/sync/incremental', requireAdmin, async (req: Request, res: Response) => {
  try {
    logger.info('Admin triggered incremental sync');
    
    const result = await historicalSyncService.runIncrementalSync();
    
    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    logger.error('Admin incremental sync failed:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

// 2. Get sync status
router.get('/admin/sync/status', requireAdmin, (req: Request, res: Response) => {
  try {
    const status = historicalSyncService.getSyncStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Failed to get sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status'
    });
  }
});

// 3. Force stop sync
router.post('/admin/sync/stop', requireAdmin, (req: Request, res: Response) => {
  try {
    historicalSyncService.forceStopSync();
    
    res.json({
      success: true,
      message: 'Sync stopped successfully'
    });
  } catch (error) {
    logger.error('Failed to stop sync:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop sync'
    });
  }
});

// 4. Set Upstox access token (Admin only)
router.post('/admin/auth/token', requireAdmin, (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;
    
    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Access token is required'
      });
    }
    
    upstoxService.setAccessToken(accessToken);
    
    res.json({
      success: true,
      message: 'Access token set successfully'
    });
  } catch (error) {
    logger.error('Failed to set access token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set access token'
    });
  }
});

// Public Routes

// 1. Get live data for a single stock
router.get('/live/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    
    if (!symbol) {
      return res.status(400).json({
        success: false,
        message: 'Symbol is required'
      });
    }
    
    const liveData = await upstoxService.getLiveData(symbol.toUpperCase());
    
    if (!liveData) {
      return res.status(404).json({
        success: false,
        message: 'Live data not found for symbol'
      });
    }
    
    res.json({
      success: true,
      data: liveData
    });
  } catch (error) {
    logger.error(`Failed to get live data for ${req.params.symbol}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to get live data'
    });
  }
});

// 2. Get live data for multiple stocks
router.post('/live/bulk', async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;
    
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Symbols array is required'
      });
    }
    
    if (symbols.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 symbols allowed per request'
      });
    }
    
    const normalizedSymbols = symbols.map(s => s.toUpperCase());
    const liveData = await upstoxService.getMultipleLiveData(normalizedSymbols);
    
    res.json({
      success: true,
      data: liveData,
      count: Object.keys(liveData).length
    });
  } catch (error) {
    logger.error('Failed to get bulk live data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get live data'
    });
  }
});

// 3. Get available stocks for live data
router.get('/stocks/available', async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    
    const query: any = {
      instrumentType: 'EQ',
      isActive: true,
      instrumentKey: { $exists: true, $ne: null }
    };
    
    if (search) {
      query.$or = [
        { symbol: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const [stocks, total] = await Promise.all([
      Stock.find(query)
        .select('symbol name instrumentKey exchange sector industry')
        .sort({ symbol: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Stock.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: stocks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.error('Failed to get available stocks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available stocks'
    });
  }
});

// 4. Start live data stream for instruments
router.post('/admin/live/start', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;
    
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Symbols array is required'
      });
    }
    
    // Get instrument keys for the symbols
    const stocks = await Stock.find({
      symbol: { $in: symbols.map(s => s.toUpperCase()) },
      instrumentType: 'EQ',
      isActive: true,
      instrumentKey: { $exists: true, $ne: null }
    }).select('instrumentKey');
    
    const instrumentKeys = stocks.map(stock => stock.instrumentKey).filter(Boolean);
    
    if (instrumentKeys.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid instrument keys found for provided symbols'
      });
    }
    
    await upstoxService.startLiveDataStream(instrumentKeys);
    
    res.json({
      success: true,
      message: `Live data stream started for ${instrumentKeys.length} instruments`,
      instrumentKeys: instrumentKeys.length
    });
  } catch (error) {
    logger.error('Failed to start live data stream:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start live data stream'
    });
  }
});

// Error handler
router.use((error: any, req: Request, res: Response, next: any) => {
  logger.error('Upstox route error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

export default router;
export { upstoxService, historicalSyncService };