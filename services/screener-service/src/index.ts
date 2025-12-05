import 'dotenv/config';
import express from 'express';
import { SharedDatabase, ClickHouseDatabase } from '../../../shared/database';
import { logger } from '../../../shared/utils/logger';
import screenerRoutes from './routes/screenerRoutes';

const app = express();
const PORT = process.env.SCREENER_SERVICE_PORT || 3003;

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'screener-service',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/screener', screenerRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('API Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
async function start() {
  try {
    // Connect to databases
    await SharedDatabase.getInstance().connect('screener-service');
    logger.info('✅ Connected to MongoDB');

    await ClickHouseDatabase.getInstance().connect('screener-service');
    logger.info('✅ Connected to ClickHouse');

    app.listen(PORT, () => {
      logger.info(`🚀 Screener Service running on port ${PORT}`);
      logger.info(`📊 Endpoints:`);
      logger.info(`   - GET  /health`);
      logger.info(`   - POST /api/screener/scan`);
      logger.info(`   - GET  /api/screener/wyckoff`);
    });

  } catch (error) {
    logger.error('Failed to start screener service:', error);
    process.exit(1);
  }
}

start();