import { Server as SocketIOServer, Socket } from 'socket.io';
import axios from 'axios';
import { logger } from '../../../shared/utils/logger';

const SCREENER_SERVICE_URL = process.env.SCREENER_SERVICE_URL || 'http://localhost:3003';

export class ScreenerSocketHandler {
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupHandlers();
  }

  private setupHandlers() {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Handle Wyckoff scan
      socket.on('screener:wyckoff', async (data: any) => {
        await this.handleWyckoffScan(socket, data);
      });

      // Handle custom scan
      socket.on('screener:scan', async (data: any) => {
        await this.handleCustomScan(socket, data);
      });

      // Handle scan cancellation
      socket.on('screener:cancel', () => {
        logger.info(`Scan cancelled by client: ${socket.id}`);
        socket.emit('screener:cancelled', { message: 'Scan cancelled' });
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Handle Wyckoff scan with streaming progress
   */
  private async handleWyckoffScan(socket: Socket, data: any) {
    try {
      const { timeframe = '1day', confidence = '70', limit = '100' } = data;

      logger.info(`Socket: Wyckoff scan - ${socket.id} - timeframe=${timeframe}`);

      // Emit start event
      socket.emit('screener:started', {
        message: 'Wyckoff scan started',
        timeframe,
        confidence,
        limit
      });

      // Make request to screener service with longer timeout
      const response = await axios.get(
        `${SCREENER_SERVICE_URL}/api/screener/wyckoff`,
        {
          params: { timeframe, confidence, limit },
          timeout: 600000, // 10 minutes
          onDownloadProgress: (progressEvent) => {
            // Emit progress updates
            socket.emit('screener:progress', {
              loaded: progressEvent.loaded,
              total: progressEvent.total || 0
            });
          }
        }
      );

      // Emit results
      socket.emit('screener:results', response.data);
      socket.emit('screener:completed', { 
        message: 'Scan completed successfully',
        resultCount: response.data.results?.length || 0 
      });

    } catch (error: any) {
      logger.error('Socket: Wyckoff scan failed:', error.message);
      
      socket.emit('screener:error', {
        error: 'Scan failed',
        message: error.message,
        code: error.code
      });
    }
  }

  /**
   * Handle custom scan with streaming results
   */
  private async handleCustomScan(socket: Socket, data: any) {
    try {
      logger.info(`Socket: Custom scan - ${socket.id}`);

      socket.emit('screener:started', {
        message: 'Custom scan started',
        filters: data.filters
      });

      // Make request with chunked response handling
      const response = await axios.post(
        `${SCREENER_SERVICE_URL}/api/screener/scan`,
        data,
        {
          timeout: 600000, // 10 minutes
          onDownloadProgress: (progressEvent) => {
            socket.emit('screener:progress', {
              loaded: progressEvent.loaded,
              total: progressEvent.total || 0
            });
          }
        }
      );

      // Stream results if large dataset
      if (response.data.results && response.data.results.length > 0) {
        const results = response.data.results;
        const chunkSize = 10;
        
        for (let i = 0; i < results.length; i += chunkSize) {
          const chunk = results.slice(i, i + chunkSize);
          socket.emit('screener:chunk', {
            data: chunk,
            index: i,
            total: results.length
          });
          
          // Small delay to prevent overwhelming client
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      socket.emit('screener:results', response.data);
      socket.emit('screener:completed', { 
        message: 'Scan completed',
        resultCount: response.data.results?.length || 0,
        executionTime: response.data.executionTime
      });

    } catch (error: any) {
      logger.error('Socket: Custom scan failed:', error.message);
      
      socket.emit('screener:error', {
        error: 'Scan failed',
        message: error.message,
        code: error.code
      });
    }
  }

  /**
   * Broadcast scan progress to all connected clients
   */
  public broadcastProgress(progress: any) {
    this.io.emit('screener:broadcast-progress', progress);
  }
}
