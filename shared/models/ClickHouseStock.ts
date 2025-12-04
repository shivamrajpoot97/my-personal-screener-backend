import ClickHouseDatabase from '../database/clickhouse';
import { logger } from '../utils/logger';

export interface IStock {
  symbol: string;
  name: string;
  instrumentKey?: string;
  exchangeToken?: string;
  tradingSymbol?: string;
  instrumentType: 'EQ' | 'CE' | 'PE' | 'FUT' | 'INDEX' | 'CUR' | 'COMMODITY';
  assetType: 'EQT' | 'CUR' | 'COM' | 'IDX';
  segment: 'EQ' | 'FO' | 'CD' | 'NCD_FO' | 'MCX_FO' | 'BSE_FO';
  exchange: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  pe?: number;
  pb?: number;
  roe?: number;
  debt?: number;
  sales?: number;
  profit?: number;
  eps?: number;
  bookValue?: number;
  dividend?: number;
  industry?: string;
  sector?: string;
  lotSize: number;
  tickSize: number;
  isActive: boolean;
  enableFinancialSync: boolean;
  financialSyncStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  lastFinancialSync?: Date;
  financialSyncError?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

class ClickHouseStock {
  private db: ClickHouseDatabase;

  constructor() {
    this.db = ClickHouseDatabase.getInstance();
  }

  // Create or update a stock
  async upsert(stockData: Partial<IStock>): Promise<void> {
    try {
      const data = {
        symbol: stockData.symbol,
        name: stockData.name || '',
        instrument_key: stockData.instrumentKey || '',
        exchange_token: stockData.exchangeToken || '',
        trading_symbol: stockData.tradingSymbol || '',
        instrument_type: stockData.instrumentType || 'EQ',
        asset_type: stockData.assetType || 'EQT',
        segment: stockData.segment || 'EQ',
        exchange: stockData.exchange || 'NSE',
        price: stockData.price || 0,
        change: stockData.change || 0,
        change_percent: stockData.changePercent || 0,
        volume: stockData.volume || 0,
        market_cap: stockData.marketCap || null,
        pe: stockData.pe || null,
        pb: stockData.pb || null,
        roe: stockData.roe || null,
        debt: stockData.debt || null,
        sales: stockData.sales || null,
        profit: stockData.profit || null,
        eps: stockData.eps || null,
        book_value: stockData.bookValue || null,
        dividend: stockData.dividend || null,
        industry: stockData.industry || null,
        sector: stockData.sector || null,
        lot_size: stockData.lotSize || 1,
        tick_size: stockData.tickSize || 0.05,
        is_active: stockData.isActive !== false,
        enable_financial_sync: stockData.enableFinancialSync !== false,
        financial_sync_status: stockData.financialSyncStatus || 'pending',
        last_financial_sync: stockData.lastFinancialSync || null,
        financial_sync_error: stockData.financialSyncError || null,
        tags: stockData.tags || [],
        created_at: stockData.createdAt || new Date(),
        updated_at: new Date()
      };

      await this.db.insert('screener_db.stocks', [data]);
      logger.debug(`Stock ${stockData.symbol} upserted successfully`);
    } catch (error) {
      logger.error(`Failed to upsert stock ${stockData.symbol}:`, error);
      throw error;
    }
  }

  // Bulk upsert multiple stocks
  async bulkUpsert(stocks: Partial<IStock>[]): Promise<void> {
    try {
      const data = stocks.map(stock => ({
        symbol: stock.symbol,
        name: stock.name || '',
        instrument_key: stock.instrumentKey || '',
        exchange_token: stock.exchangeToken || '',
        trading_symbol: stock.tradingSymbol || '',
        instrument_type: stock.instrumentType || 'EQ',
        asset_type: stock.assetType || 'EQT',
        segment: stock.segment || 'EQ',
        exchange: stock.exchange || 'NSE',
        price: stock.price || 0,
        change: stock.change || 0,
        change_percent: stock.changePercent || 0,
        volume: stock.volume || 0,
        market_cap: stock.marketCap || null,
        pe: stock.pe || null,
        pb: stock.pb || null,
        roe: stock.roe || null,
        debt: stock.debt || null,
        sales: stock.sales || null,
        profit: stock.profit || null,
        eps: stock.eps || null,
        book_value: stock.bookValue || null,
        dividend: stock.dividend || null,
        industry: stock.industry || null,
        sector: stock.sector || null,
        lot_size: stock.lotSize || 1,
        tick_size: stock.tickSize || 0.05,
        is_active: stock.isActive !== false,
        enable_financial_sync: stock.enableFinancialSync !== false,
        financial_sync_status: stock.financialSyncStatus || 'pending',
        last_financial_sync: stock.lastFinancialSync || null,
        financial_sync_error: stock.financialSyncError || null,
        tags: stock.tags || [],
        created_at: stock.createdAt || new Date(),
        updated_at: new Date()
      }));

      await this.db.insert('screener_db.stocks', data);
      logger.info(`Bulk upserted ${stocks.length} stocks`);
    } catch (error) {
      logger.error('Failed to bulk upsert stocks:', error);
      throw error;
    }
  }

  // Find stocks by criteria
  async find(criteria: Partial<{
    symbol: string;
    instrumentType: string;
    exchange: string;
    isActive: boolean;
    instrumentKey: string;
  }>, options: {
    limit?: number;
    offset?: number;
    orderBy?: string;
  } = {}): Promise<IStock[]> {
    try {
      let whereClause = 'WHERE 1=1';
      
      if (criteria.symbol) {
        whereClause += ` AND symbol = '${criteria.symbol}'`;
      }
      if (criteria.instrumentType) {
        whereClause += ` AND instrument_type = '${criteria.instrumentType}'`;
      }
      if (criteria.exchange) {
        whereClause += ` AND exchange = '${criteria.exchange}'`;
      }
      if (criteria.isActive !== undefined) {
        whereClause += ` AND is_active = ${criteria.isActive ? 1 : 0}`;
      }
      if (criteria.instrumentKey) {
        whereClause += ` AND instrument_key != ''`;
      }

      let orderClause = options.orderBy || 'ORDER BY symbol';
      let limitClause = '';
      
      if (options.limit) {
        limitClause = `LIMIT ${options.limit}`;
        if (options.offset) {
          limitClause += ` OFFSET ${options.offset}`;
        }
      }

      const query = `
        SELECT 
          symbol,
          name,
          instrument_key as instrumentKey,
          exchange_token as exchangeToken,
          trading_symbol as tradingSymbol,
          instrument_type as instrumentType,
          asset_type as assetType,
          segment,
          exchange,
          price,
          change,
          change_percent as changePercent,
          volume,
          market_cap as marketCap,
          pe,
          pb,
          roe,
          debt,
          sales,
          profit,
          eps,
          book_value as bookValue,
          dividend,
          industry,
          sector,
          lot_size as lotSize,
          tick_size as tickSize,
          is_active as isActive,
          enable_financial_sync as enableFinancialSync,
          financial_sync_status as financialSyncStatus,
          last_financial_sync as lastFinancialSync,
          financial_sync_error as financialSyncError,
          tags,
          created_at as createdAt,
          updated_at as updatedAt
        FROM screener_db.stocks
        ${whereClause}
        ${orderClause}
        ${limitClause}
      `;

      const result = await this.db.query(query);
      return result as IStock[];
    } catch (error) {
      logger.error('Failed to find stocks:', error);
      throw error;
    }
  }

  // Find one stock by criteria
  async findOne(criteria: Partial<{
    symbol: string;
    instrumentType: string;
    exchange: string;
    isActive: boolean;
  }>): Promise<IStock | null> {
    const results = await this.find(criteria, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  // Count stocks by criteria
  async count(criteria: Partial<{
    symbol: string;
    instrumentType: string;
    exchange: string;
    isActive: boolean;
    instrumentKey: string;
  }> = {}): Promise<number> {
    try {
      let whereClause = 'WHERE 1=1';
      
      if (criteria.symbol) {
        whereClause += ` AND symbol = '${criteria.symbol}'`;
      }
      if (criteria.instrumentType) {
        whereClause += ` AND instrument_type = '${criteria.instrumentType}'`;
      }
      if (criteria.exchange) {
        whereClause += ` AND exchange = '${criteria.exchange}'`;
      }
      if (criteria.isActive !== undefined) {
        whereClause += ` AND is_active = ${criteria.isActive ? 1 : 0}`;
      }
      if (criteria.instrumentKey) {
        whereClause += ` AND instrument_key != ''`;
      }

      const query = `
        SELECT count() as count
        FROM screener_db.stocks
        ${whereClause}
      `;

      const result = await this.db.query(query);
      return result[0]?.count || 0;
    } catch (error) {
      logger.error('Failed to count stocks:', error);
      throw error;
    }
  }

  // Get equity stocks with instrument keys (for population script)
  async getEquityStocksWithKeys(limit?: number): Promise<IStock[]> {
    return this.find(
      {
        instrumentType: 'EQ',
        isActive: true,
        instrumentKey: 'not_empty' // Special flag to check not empty
      },
      { limit }
    );
  }
}

export default ClickHouseStock;