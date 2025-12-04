// MongoDB connection (legacy)
export { default as SharedDatabase } from './connection';

// ClickHouse connection (new)
export { default as ClickHouseDatabase } from './clickhouse';
export type { ClickHouseConfig } from './clickhouse';
