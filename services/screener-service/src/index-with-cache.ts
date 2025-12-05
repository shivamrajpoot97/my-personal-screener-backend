import 'dotenv/config';
import express from 'express';
import { SharedDatabase, ClickHouseDatabase } from '../../../shared/database';
import { logger } from '../../../shared/utils/logger';
import screenerRoutes from './routes/screenerRoutes-cached';
import { PreComputeService } from './services/PreComputeService';
import { CacheService } from './services/CacheService';

const app = express();
const PORT = process.env.SCREENER_SERVICE_PORT || 3003;

// Middleware
app.use(express.json());

// Health check with cache info
app.get('/health', async (req, res) => {
  try {
    const cacheStats = await CacheService.getCacheStats();
    
    res.json({ 
      status: 'ok', 
      service: 'screener-service-with-cache',
      timestamp: new Date().toISOString(),
      cache: {
        enabled: true,
        stats: cacheStats,
        preCompute: PreComputeService.getStatus()
      }
    });
  } catch (error) {
    res.json({ 
      status: 'ok', 
      service: 'screener-service-with-cache',
      timestamp: new Date().toISOString(),
      cache: { enabled: true, error: 'Failed to get stats' }
    });
  }
});

// Routes
app.use('/api/screener', screenerRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('API Error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: err.message 
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  PreComputeService.stopAll();
  await SharedDatabase.getInstance().disconnect('screener-service');
  await ClickHouseDatabase.getInstance().disconnect('screener-service');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  PreComputeService.stopAll();
  await SharedDatabase.getInstance().disconnect('screener-service');
  await ClickHouseDatabase.getInstance().disconnect('screener-service');
  process.exit(0);
});

// Start server
async function start() {
  try {
    // Connect to databases
    await SharedDatabase.getInstance().connect('screener-service');
    logger.info('✅ Connected to MongoDB');

    await ClickHouseDatabase.getInstance().connect('screener-service');
    logger.info('✅ Connected to ClickHouse');

    // Initialize pre-compute jobs
    PreComputeService.initialize();
    logger.info('✅ Pre-compute service initialized');

    // Optionally run initial pre-compute on startup (uncomment if needed)
    // logger.info('🔄 Running initial pre-computation...');
    // PreComputeService.triggerManual('wyckoff').catch(err => {
    //   logger.error('Initial pre-compute failed:', err);
    // });

    app.listen(PORT, () => {
      logger.info(`\n${'='.repeat(70)}`);
      logger.info(`🚀 Screener Service (WITH CACHING) running on port ${PORT}`);
      logger.info(`${'='.repeat(70)}`);
      logger.info(`\n📊 Endpoints:`);
      logger.info(`   - GET  /health (with cache stats)`);
      logger.info(`   - POST /api/screener/scan (cached)`);
      logger.info(`   - GET  /api/screener/wyckoff (cached)`);
      logger.info(`   - GET  /api/screener/cache/stats`);
      logger.info(`   - POST /api/screener/cache/precompute`);
      logger.info(`   - DELETE /api/screener/cache`);
      logger.info(`\n💾 Cache Features:`);
      logger.info(`   - Automatic daily pre-computation at 1 AM`);
      logger.info(`   - 24-hour cache TTL`);
      logger.info(`   - Instant response for cached queries`);
      logger.info(`   - Manual cache invalidation`);
      logger.info(`\n⏰ Scheduled Jobs:`);
      logger.info(`   - Daily pre-compute: 1 AM`);
      logger.info(`   - Cache cleanup: 2 AM`);
      logger.info(`\n${'='.repeat(70)}\n`);
    });

  } catch (error) {
    logger.error('Failed to start screener service:', error);
    process.exit(1);
  }
}

start();
