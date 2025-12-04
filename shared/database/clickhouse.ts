import { createClient, ClickHouseClient } from '@clickhouse/client';
import { logger } from '../utils/logger';

export interface ClickHouseConfig {
  url: string;
  username: string;
  password: string;
  database?: string;
}

class ClickHouseDatabase {
  private static instance: ClickHouseDatabase;
  private client: ClickHouseClient | null = null;
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): ClickHouseDatabase {
    if (!ClickHouseDatabase.instance) {
      ClickHouseDatabase.instance = new ClickHouseDatabase();
    }
    return ClickHouseDatabase.instance;
  }

  public async connect(connectionName?: string): Promise<void> {
    if (this.isConnected && this.client) {
      logger.info(`Already connected to ClickHouse (${connectionName || "default"})`);
      return;
    }

    try {
      // Default ClickHouse config - can be overridden by environment variables
      const config: ClickHouseConfig = {
        url: process.env.CLICKHOUSE_URL || 'https://qv2t7flwme.ap-south-1.aws.clickhouse.cloud:8443',
        username: process.env.CLICKHOUSE_USERNAME || 'default',
        password: process.env.CLICKHOUSE_PASSWORD || 'xV1KZx0EgT.lm',
        database: process.env.CLICKHOUSE_DATABASE || 'default'
      };

      this.client = createClient(config);

      // Test connection
      const result = await this.client.query({
        query: 'SELECT 1 as test',
        format: 'JSONEachRow',
      });

      const testData = await result.json();
      if (testData.length > 0) {
        this.isConnected = true;
        logger.info(`Connected to ClickHouse successfully (${connectionName || "default"})`);
        
        // Initialize database schema
        await this.initializeSchema();
      } else {
        throw new Error('Connection test failed');
      }

    } catch (error) {
      logger.error(`Failed to connect to ClickHouse (${connectionName || "default"}):`, error);
      this.isConnected = false;
      throw error;
    }
  }

  public async disconnect(connectionName?: string): Promise<void> {
    if (!this.isConnected || !this.client) {
      return;
    }

    try {
      await this.client.close();
      this.client = null;
      this.isConnected = false;
      logger.info(`Disconnected from ClickHouse (${connectionName || "default"})`);
    } catch (error) {
      logger.error(`Error disconnecting from ClickHouse (${connectionName || "default"}):`, error);
    }
  }

  public getClient(): ClickHouseClient {
    if (!this.client || !this.isConnected) {
      throw new Error('ClickHouse client is not connected. Call connect() first.');
    }
    return this.client;
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  private async initializeSchema(): Promise<void> {
    if (!this.client) return;

    try {
      logger.info('Initializing ClickHouse schema...');

      // Create database if not exists
      await this.client.command({
        query: `CREATE DATABASE IF NOT EXISTS screener_db`,
      });

      // Create stocks table
      await this.client.command({
        query: `
          CREATE TABLE IF NOT EXISTS screener_db.stocks (
            symbol String,
            name String,
            instrument_key String,
            exchange_token String,
            trading_symbol String,
            instrument_type Enum8('EQ'=1, 'CE'=2, 'PE'=3, 'FUT'=4, 'INDEX'=5, 'CUR'=6, 'COMMODITY'=7),
            asset_type Enum8('EQT'=1, 'CUR'=2, 'COM'=3, 'IDX'=4),
            segment Enum8('EQ'=1, 'FO'=2, 'CD'=3, 'NCD_FO'=4, 'MCX_FO'=5, 'BSE_FO'=6),
            exchange String,
            price Float64,
            change Float64,
            change_percent Float64,
            volume UInt64,
            market_cap Nullable(Float64),
            pe Nullable(Float64),
            pb Nullable(Float64),
            roe Nullable(Float64),
            debt Nullable(Float64),
            sales Nullable(Float64),
            profit Nullable(Float64),
            eps Nullable(Float64),
            book_value Nullable(Float64),
            dividend Nullable(Float64),
            industry Nullable(String),
            sector Nullable(String),
            lot_size UInt32 DEFAULT 1,
            tick_size Float64 DEFAULT 0.05,
            is_active Bool DEFAULT true,
            enable_financial_sync Bool DEFAULT true,
            financial_sync_status Enum8('pending'=1, 'in_progress'=2, 'completed'=3, 'failed'=4) DEFAULT 'pending',
            last_financial_sync Nullable(DateTime),
            financial_sync_error Nullable(String),
            tags Array(String) DEFAULT [],
            created_at DateTime DEFAULT now(),
            updated_at DateTime DEFAULT now()
          ) ENGINE = ReplacingMergeTree(updated_at)
          ORDER BY (symbol, instrument_type, exchange)
          SETTINGS index_granularity = 8192
        `
      });

      // Create candles table - optimized for time series data
      await this.client.command({
        query: `
          CREATE TABLE IF NOT EXISTS screener_db.candles (
            symbol String,
            timeframe Enum8('15min'=1, '1hour'=2, '1day'=3),
            timestamp DateTime,
            open Float64,
            high Float64,
            low Float64,
            close Float64,
            volume UInt64,
            open_interest Nullable(UInt64),
            price_change Float64,
            price_change_percent Float64,
            range Float64,
            body_size Float64,
            upper_shadow Float64,
            lower_shadow Float64,
            created_at DateTime DEFAULT now(),
            updated_at DateTime DEFAULT now()
          ) ENGINE = ReplacingMergeTree(updated_at)
          PARTITION BY toYYYYMM(timestamp)
          ORDER BY (symbol, timeframe, timestamp)
          SETTINGS index_granularity = 8192
        `
      });

      // Create candle_features table - for technical indicators
      await this.client.command({
        query: `
          CREATE TABLE IF NOT EXISTS screener_db.candle_features (
            symbol String,
            timeframe Enum8('15min'=1, '1hour'=2, '1day'=3),
            timestamp DateTime,
            candle_ref String, -- Reference to candle (symbol_timeframe_timestamp)
            -- Moving Averages (short keys for compact storage)
            sma5 Nullable(Float64),
            sma10 Nullable(Float64),
            sma20 Nullable(Float64),
            sma50 Nullable(Float64),
            sma200 Nullable(Float64),
            ema9 Nullable(Float64),
            ema12 Nullable(Float64),
            ema21 Nullable(Float64),
            ema26 Nullable(Float64),
            -- Momentum
            rsi Nullable(Float64),
            rsi14 Nullable(Float64),
            stoch_k Nullable(Float64),
            stoch_d Nullable(Float64),
            williams_r Nullable(Float64),
            -- Trend
            macd Nullable(Float64),
            macd_signal Nullable(Float64),
            macd_histogram Nullable(Float64),
            adx Nullable(Float64),
            -- Volatility
            bb_upper Nullable(Float64),
            bb_middle Nullable(Float64),
            bb_lower Nullable(Float64),
            atr Nullable(Float64),
            -- Volume
            volume_sma Nullable(Float64),
            volume_ratio Nullable(Float64),
            vwap Nullable(Float64),
            money_flow Nullable(Float64),
            -- Price Action
            candle_pattern Nullable(String),
            trend_direction Nullable(Int8), -- -1, 0, 1
            -- Support/Resistance
            pivot Nullable(Float64),
            support1 Nullable(Float64),
            support2 Nullable(Float64),
            support3 Nullable(Float64),
            resistance1 Nullable(Float64),
            resistance2 Nullable(Float64),
            resistance3 Nullable(Float64),
            -- Market Structure
            higher_high Nullable(Bool),
            higher_low Nullable(Bool),
            lower_high Nullable(Bool),
            lower_low Nullable(Bool),
            -- Strength
            relative_strength Nullable(Float64),
            price_position Nullable(Float64),
            volume_strength Nullable(Float64),
            created_at DateTime DEFAULT now(),
            updated_at DateTime DEFAULT now()
          ) ENGINE = ReplacingMergeTree(updated_at)
          PARTITION BY toYYYYMM(timestamp)
          ORDER BY (symbol, timeframe, timestamp)
          SETTINGS index_granularity = 8192
        `
      });

      // Create users table (for auth service)
      await this.client.command({
        query: `
          CREATE TABLE IF NOT EXISTS screener_db.users (
            id String,
            email String,
            password String,
            role Enum8('user'=1, 'admin'=2) DEFAULT 'user',
            access_allowed Bool DEFAULT false,
            is_active Bool DEFAULT true,
            created_at DateTime DEFAULT now(),
            updated_at DateTime DEFAULT now()
          ) ENGINE = ReplacingMergeTree(updated_at)
          ORDER BY (id, email)
          SETTINGS index_granularity = 8192
        `
      });

      logger.info('✅ ClickHouse schema initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize ClickHouse schema:', error);
      throw error;
    }
  }

  // Helper method to execute queries
  public async query(sql: string, format: string = 'JSONEachRow'): Promise<any> {
    if (!this.client) {
      throw new Error('ClickHouse client is not connected');
    }

    const result = await this.client.query({
      query: sql,
      format: format as any,
    });

    return await result.json();
  }

  // Helper method to execute commands (DDL/DML)
  public async command(sql: string): Promise<void> {
    if (!this.client) {
      throw new Error('ClickHouse client is not connected');
    }

    await this.client.command({
      query: sql,
    });
  }

  // Bulk insert helper
  public async insert(table: string, data: any[]): Promise<void> {
    if (!this.client || data.length === 0) {
      return;
    }

    await this.client.insert({
      table: table,
      values: data,
      format: 'JSONEachRow',
    });
  }
}

export default ClickHouseDatabase;