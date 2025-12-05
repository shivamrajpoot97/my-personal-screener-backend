#!/usr/bin/env tsx
import 'dotenv/config';
import { SharedDatabase, ClickHouseDatabase } from '../shared/database';
import { Stock } from '../shared/models';
import { logger } from '../shared/utils/logger';

class MissingStocksFinder {
  private clickhouse: ClickHouseDatabase;
  constructor() { this.clickhouse = ClickHouseDatabase.getInstance(); }
  async initialize(): Promise<void> {
    await SharedDatabase.getInstance().connect('find-missing');
    await this.clickhouse.connect('find-missing');
  }
  async findMissing(): Promise<void> {
    await this.initialize();
    const stocks = await Stock.find({ instrumentType: 'EQ', isActive: true, instrumentKey: { $exists: true, $ne: null } });
    const query = 'SELECT DISTINCT symbol FROM screener_db.candles';
    const result = await this.clickhouse.query(query);
    const symbolsInCH = new Set(result.map((r: any) => r.symbol));
    const missing = stocks.filter(s => !symbolsInCH.has(s.symbol));
    logger.info(`MongoDB: ${stocks.length} stocks | ClickHouse: ${symbolsInCH.size} stocks | Missing: ${missing.length}`);
    missing.slice(0, 100).forEach((s, i) => logger.info(`${i+1}. ${s.symbol} - ${s.name}`));
    const symbols = missing.map(s => s.symbol).slice(0, 50).join(',');
    logger.info(`\nPopulate: npm run populate-candles -- --symbols=${symbols}`);
    await SharedDatabase.getInstance().disconnect('find-missing');
    await this.clickhouse.disconnect('find-missing');
  }
}
new MissingStocksFinder().findMissing();
