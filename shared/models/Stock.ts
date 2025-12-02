import mongoose, { Document, Schema } from 'mongoose';

export interface IStockData {
  symbol: string;
  name: string;
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
  lastUpdated: Date;
}

// Extended interface to handle both stocks and derivatives
export interface IStock extends Document, IStockData {
  // Basic instrument info
  instrumentKey?: string;
  exchangeToken?: string;
  tradingSymbol?: string;
  assetSymbol?: string;
  underlyingSymbol?: string;
  
  // Instrument type and classification
  instrumentType: 'EQ' | 'CE' | 'PE' | 'FUT' | 'INDEX' | 'CUR' | 'COMMODITY';
  assetType: 'EQT' | 'CUR' | 'COM' | 'IDX';
  underlyingType?: 'EQT' | 'CUR' | 'COM' | 'IDX';
  segment: 'EQ' | 'FO' | 'CD' | 'NCD_FO' | 'MCX_FO' | 'BSE_FO';
  
  // Derivatives specific fields
  strikePrice?: number;
  expiry?: Date;
  lotSize?: number;
  freezeQuantity?: number;
  minimumLot?: number;
  tickSize?: number;
  qtyMultiplier?: number;
  weekly?: boolean;
  
  // Financial data sync settings
  enableFinancialSync: boolean;
  financialSyncPriority: number;
  lastFinancialSync?: Date;
  financialSyncStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  financialSyncError?: string;
  
  // Metadata
  exchange: string;
  isActive: boolean;
  tags: string[];
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const StockSchema = new Schema<IStock>({
  // Basic fields
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
  },
  
  // Instrument identification
  instrumentKey: {
    type: String,
  },
  exchangeToken: {
    type: String,
  },
  tradingSymbol: {
    type: String,
  },
  assetSymbol: {
    type: String,
  },
  underlyingSymbol: {
    type: String,
  },
  
  // Classification
  instrumentType: {
    type: String,
    enum: ['EQ', 'CE', 'PE', 'FUT', 'INDEX', 'CUR', 'COMMODITY'],
    default: 'EQ',
  },
  assetType: {
    type: String,
    enum: ['EQT', 'CUR', 'COM', 'IDX'],
    default: 'EQT',
  },
  underlyingType: {
    type: String,
    enum: ['EQT', 'CUR', 'COM', 'IDX'],
  },
  segment: {
    type: String,
    enum: ['EQ', 'FO', 'CD', 'NCD_FO', 'MCX_FO', 'BSE_FO'],
    default: 'EQ',
  },
  
  // Derivatives fields
  strikePrice: {
    type: Number,
    min: 0,
  },
  expiry: {
    type: Date,
  },
  lotSize: {
    type: Number,
    min: 1,
  },
  freezeQuantity: {
    type: Number,
    min: 0,
  },
  minimumLot: {
    type: Number,
    min: 1,
  },
  tickSize: {
    type: Number,
    min: 0,
  },
  qtyMultiplier: {
    type: Number,
    min: 1,
  },
  weekly: {
    type: Boolean,
    default: false,
  },
  
  // Price and market data
  price: {
    type: Number,
    required: true,
    default: 0,
  },
  change: {
    type: Number,
    default: 0,
  },
  changePercent: {
    type: Number,
    default: 0,
  },
  volume: {
    type: Number,
    default: 0,
  },
  marketCap: {
    type: Number,
  },
  pe: {
    type: Number,
  },
  pb: {
    type: Number,
  },
  roe: {
    type: Number,
  },
  debt: {
    type: Number,
  },
  sales: {
    type: Number,
  },
  profit: {
    type: Number,
  },
  eps: {
    type: Number,
  },
  bookValue: {
    type: Number,
  },
  dividend: {
    type: Number,
  },
  industry: {
    type: String,
  },
  sector: {
    type: String,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  
  // Financial sync fields
  enableFinancialSync: {
    type: Boolean,
    default: function() {
      return this.instrumentType === 'EQ';
    },
  },
  financialSyncPriority: {
    type: Number,
    enum: [1, 2, 3],
    default: 2,
  },
  lastFinancialSync: {
    type: Date,
  },
  financialSyncStatus: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed'],
    default: 'pending',
  },
  financialSyncError: {
    type: String,
  },
  
  // Metadata
  exchange: {
    type: String,
    required: true,
    default: 'NSE',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  tags: {
    type: [String],
    default: [],
  },
}, {
  timestamps: true,
});

// ============================================================================
// COMPOSITE INDEXES ONLY
// ============================================================================

// PRIMARY UNIQUE: Instruments with instrumentKey
StockSchema.index(
  { instrumentKey: 1, instrumentType: 1, segment: 1 },
  { 
    unique: true, 
    sparse: true,
    name: 'idx_instrument_key_compound'
  }
);

// FALLBACK UNIQUE: Instruments without instrumentKey (equities)
StockSchema.index(
  { symbol: 1, instrumentType: 1, segment: 1, exchange: 1 },
  { 
    unique: true, 
    partialFilterExpression: { instrumentKey: { $exists: false } },
    name: 'idx_symbol_fallback'
  }
);

// DERIVATIVES UNIQUE: Options/futures without instrumentKey
StockSchema.index(
  { symbol: 1, instrumentType: 1, segment: 1, exchange: 1, strikePrice: 1, expiry: 1 },
  { 
    unique: true,
    partialFilterExpression: { 
      instrumentKey: { $exists: false },
      strikePrice: { $exists: true },
      expiry: { $exists: true }
    },
    name: 'idx_derivatives_unique'
  }
);

// QUERY OPTIMIZATION: Common query patterns
StockSchema.index(
  { symbol: 1, instrumentType: 1 }, 
  { name: 'idx_symbol_type' }
);

StockSchema.index(
  { exchange: 1, segment: 1, isActive: 1 }, 
  { name: 'idx_exchange_segment' }
);

StockSchema.index(
  { instrumentType: 1, assetType: 1, isActive: 1 }, 
  { name: 'idx_type_asset' }
);

StockSchema.index(
  { underlyingSymbol: 1, expiry: 1, strikePrice: 1 }, 
  { name: 'idx_underlying_chain' }
);

StockSchema.index(
  { enableFinancialSync: 1, financialSyncStatus: 1 }, 
  { name: 'idx_sync_status' }
);

StockSchema.index(
  { tags: 1, isActive: 1 }, 
  { name: 'idx_tags' }
);

StockSchema.index(
  { lastFinancialSync: 1, enableFinancialSync: 1 }, 
  { name: 'idx_sync_schedule' }
);

StockSchema.index(
  { expiry: 1, instrumentType: 1 }, 
  { name: 'idx_expiry_tracking' }
);

StockSchema.index(
  { industry: 1, isActive: 1 }, 
  { name: 'idx_industry' }
);

StockSchema.index(
  { sector: 1, isActive: 1 }, 
  { name: 'idx_sector' }
);

// ============================================================================
// VIRTUALS
// ============================================================================

StockSchema.virtual('isDerivative').get(function() {
  return ['CE', 'PE', 'FUT'].includes(this.instrumentType);
});

StockSchema.virtual('isOption').get(function() {
  return ['CE', 'PE'].includes(this.instrumentType);
});

StockSchema.virtual('needsMonthlySync').get(function() {
  if (!this.enableFinancialSync || !this.isActive || this.instrumentType !== 'EQ') return false;
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return !this.lastFinancialSync || this.lastFinancialSync < currentMonth;
});

export default mongoose.models.Stock || mongoose.model<IStock>('Stock', StockSchema);