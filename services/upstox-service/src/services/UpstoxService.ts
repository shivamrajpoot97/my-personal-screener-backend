import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { createClient } from 'redis';
import { logger } from '@shared/utils/logger';
import { Stock, Candle } from '@shared/models';
import { 
  UpstoxAuth, 
  UpstoxHistoricalData, 
  UpstoxLiveData, 
  SyncJobConfig,
  CandleTimeframe,
  UPSTOX_INTERVALS,
  RedisLiveData 
} from '../types/upstox';

export class UpstoxService {
  private apiClient: AxiosInstance;
  private wsConnection: WebSocket | null = null;
  private redisClient: any;
  private accessToken: string | null = null;
  private readonly baseUrl = 'https://api.upstox.com/v2';
  private readonly wsUrl = 'wss://ws.upstox.com/v2/feed';
  
  constructor() {
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
    
    this.setupRedis();
    this.setupAxiosInterceptors();
  }

  private async setupRedis() {
    try {
      this.redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      
      await this.redisClient.connect();
      logger.info('Connected to Redis for live data caching');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
    }
  }

  private setupAxiosInterceptors() {
    this.apiClient.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          logger.warn('Upstox token expired, need to refresh');
          // Handle token refresh logic here
        }
        return Promise.reject(error);
      }
    );
  }

  // Authentication
  public setAccessToken(token: string) {
    this.accessToken = token;
    logger.info('Upstox access token set');
  }

  // Historical Data Fetching
  public async fetchHistoricalCandles(
    instrumentKey: string,
    interval: string,
    fromDate: Date,
    toDate: Date
  ): Promise<number[][]> {
    try {
      const response = await this.apiClient.get<UpstoxHistoricalData>(
        `/historical-candle/${instrumentKey}/${interval}/${toDate.toISOString().split('T')[0]}/${fromDate.toISOString().split('T')[0]}`
      );

      if (response.data.status === 'success') {
        return response.data.data.candles;
      }
      
      throw new Error(`Upstox API error: ${response.data.status}`);
    } catch (error) {
      logger.error(`Failed to fetch historical data for ${instrumentKey}:`, error);
      throw error;
    }
  }

  // Sync historical data for equity stocks
  public async syncEquityHistoricalData(
    symbol: string, 
    timeframe: CandleTimeframe,
    fromDate: Date,
    toDate: Date
  ): Promise<void> {
    try {
      // Get stock info
      const stock = await Stock.findOne({ 
        symbol, 
        instrumentType: 'EQ',
        isActive: true 
      });

      if (!stock || !stock.instrumentKey) {
        throw new Error(`Stock ${symbol} not found or missing instrument key`);
      }

      logger.info(`Syncing ${symbol} ${timeframe.mongoTimeframe} data from ${fromDate.toISOString()} to ${toDate.toISOString()}`);

      // Fetch data in chunks to avoid rate limits
      const candles = await this.fetchHistoricalCandles(
        stock.instrumentKey,
        timeframe.upstoxInterval,
        fromDate,
        toDate
      );

      // Save to database
      const candleDocuments = candles.map(candleArray => {
        return Candle.parseUpstoxCandle(symbol, timeframe.mongoTimeframe, candleArray);
      });

      if (candleDocuments.length > 0) {
        await Candle.bulkWrite(
          candleDocuments.map(doc => ({
            updateOne: {
              filter: { 
                symbol: doc.symbol,
                timeframe: doc.timeframe,
                timestamp: doc.timestamp
              },
              update: { $set: doc },
              upsert: true
            }
          }))
        );

        logger.info(`Saved ${candleDocuments.length} ${timeframe.mongoTimeframe} candles for ${symbol}`);
      }

    } catch (error) {
      logger.error(`Failed to sync historical data for ${symbol}:`, error);
      throw error;
    }
  }

  // Sync incremental data (from last candle to current)
  public async syncIncrementalData(): Promise<void> {
    try {
      const equityStocks = await Stock.find({
        instrumentType: 'EQ',
        isActive: true,
        instrumentKey: { $exists: true, $ne: null }
      });

      logger.info(`Starting incremental sync for ${equityStocks.length} equity stocks`);

      for (const stock of equityStocks) {
        try {
          // Get last 15min candle
          const lastCandle = await Candle.findOne({
            symbol: stock.symbol,
            timeframe: '15min'
          }).sort({ timestamp: -1 });

          const fromDate = lastCandle 
            ? new Date(lastCandle.timestamp.getTime() + 15 * 60 * 1000) // Add 15 minutes
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to 30 days ago

          const toDate = new Date();

          // Skip if no new data needed
          if (fromDate >= toDate) {
            continue;
          }

          await this.syncEquityHistoricalData(
            stock.symbol,
            UPSTOX_INTERVALS['15min'],
            fromDate,
            toDate
          );

          // Add delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          logger.error(`Failed to sync incremental data for ${stock.symbol}:`, error);
          // Continue with next stock
        }
      }

      logger.info('Incremental sync completed');
    } catch (error) {
      logger.error('Incremental sync failed:', error);
      throw error;
    }
  }

  // WebSocket Live Data
  public async startLiveDataStream(instrumentKeys: string[]): Promise<void> {
    try {
      if (!this.accessToken) {
        throw new Error('Access token required for live data stream');
      }

      const wsUrl = `${this.wsUrl}?access_token=${this.accessToken}`;
      this.wsConnection = new WebSocket(wsUrl);

      this.wsConnection.on('open', () => {
        logger.info('Upstox WebSocket connection established');
        
        // Subscribe to instruments
        const subscribeMessage = {
          guid: 'someguid',
          method: 'sub',
          data: {
            mode: 'full',
            instrumentKeys: instrumentKeys
          }
        };

        this.wsConnection?.send(JSON.stringify(subscribeMessage));
        logger.info(`Subscribed to ${instrumentKeys.length} instruments for live data`);
      });

      this.wsConnection.on('message', async (data) => {
        try {
          await this.handleLiveDataMessage(data);
        } catch (error) {
          logger.error('Error handling live data message:', error);
        }
      });

      this.wsConnection.on('close', () => {
        logger.warn('Upstox WebSocket connection closed');
        // Implement reconnection logic
        setTimeout(() => {
          this.startLiveDataStream(instrumentKeys);
        }, 5000);
      });

      this.wsConnection.on('error', (error) => {
        logger.error('Upstox WebSocket error:', error);
      });

    } catch (error) {
      logger.error('Failed to start live data stream:', error);
      throw error;
    }
  }

  private async handleLiveDataMessage(data: Buffer): Promise<void> {
    try {
      const message: UpstoxLiveData = JSON.parse(data.toString());
      
      if (message.feeds) {
        for (const [instrumentKey, feedData] of Object.entries(message.feeds)) {
          const ltpc = feedData.ff?.marketFF?.ltpc;
          const ohlc = feedData.ff?.marketFF?.marketOHLC?.ohlc;
          
          if (ltpc && ohlc) {
            // Get symbol from instrument key
            const stock = await Stock.findOne({ instrumentKey });
            if (!stock) continue;

            const liveData: RedisLiveData = {
              symbol: stock.symbol,
              ltp: ltpc.ltp,
              change: ltpc.ltp - ltpc.cp,
              changePercent: ((ltpc.ltp - ltpc.cp) / ltpc.cp) * 100,
              volume: 0, // Volume would come from different feed
              ohlc: {
                open: ohlc[0],
                high: ohlc[1],
                low: ohlc[2],
                close: ohlc[3]
              },
              timestamp: new Date()
            };

            // Cache in Redis with 5-minute expiry
            await this.redisClient?.setEx(
              `live_data:${stock.symbol}`,
              300,
              JSON.stringify(liveData)
            );

            logger.debug(`Updated live data for ${stock.symbol}: ${ltpc.ltp}`);
          }
        }
      }
    } catch (error) {
      logger.error('Error parsing live data message:', error);
    }
  }

  // Get cached live data
  public async getLiveData(symbol: string): Promise<RedisLiveData | null> {
    try {
      const cached = await this.redisClient?.get(`live_data:${symbol}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error(`Failed to get live data for ${symbol}:`, error);
      return null;
    }
  }

  // Get multiple live data
  public async getMultipleLiveData(symbols: string[]): Promise<{ [symbol: string]: RedisLiveData }> {
    try {
      const keys = symbols.map(symbol => `live_data:${symbol}`);
      const values = await this.redisClient?.mGet(keys);
      
      const result: { [symbol: string]: RedisLiveData } = {};
      
      values?.forEach((value: string | null, index: number) => {
        if (value) {
          result[symbols[index]!] = JSON.parse(value);
        }
      });

      return result;
    } catch (error) {
      logger.error('Failed to get multiple live data:', error);
      return {};
    }
  }

  // Cleanup
  public async disconnect(): Promise<void> {
    try {
      if (this.wsConnection) {
        this.wsConnection.close();
        this.wsConnection = null;
      }

      if (this.redisClient) {
        await this.redisClient.disconnect();
      }

      logger.info('Upstox service disconnected');
    } catch (error) {
      logger.error('Error during disconnect:', error);
    }
  }
}

export default UpstoxService;