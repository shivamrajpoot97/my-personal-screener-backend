import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from '@shared/utils/logger';
import SharedDatabase from '@shared/database/connection';
import CronService from './services/CronService';
import candleRoutes from './routes/candleRoutes';

// Load environment variables
dotenv.config();

const app = express();
// Default port updated to 3005
const PORT = process.env.CANDLE_SERVICE_PORT || 3005;

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/candles', candleRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'candle-service',
    database: SharedDatabase.getInstance().getConnectionStatus()
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Stop cron jobs
    CronService.stopAllJobs();
    
    // Close database connection
    await SharedDatabase.getInstance().disconnect('candle-service');
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await SharedDatabase.getInstance().connect('candle-service');
    
    // Initialize cron jobs
    CronService.init();
    
    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`Candle service started on port ${PORT}`);
      logger.info('Available endpoints:');
      logger.info('  GET  /health - Health check');
      logger.info('  POST /api/candles - Store candle data');
      logger.info('  GET  /api/candles - Query candle data');
      logger.info('  POST /api/candles/convert - Manual conversion trigger');
    });
    
  } catch (error) {
    logger.error('Failed to start candle service:', error);
    process.exit(1);
  }
};

startServer();

export default app;