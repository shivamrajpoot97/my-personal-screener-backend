import mongoose, { Document, Schema } from 'mongoose';

export interface ICandleData {
  symbol: string;
  timeframe: string; // '15min', '1hour', '1day'
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest?: number;
  // Basic derived metrics (kept for quick access)
  priceChange: number;
  priceChangePercent: number;
  range: number;
  bodySize: number;
  upperShadow: number;
  lowerShadow: number;
}

export interface ICandle extends Document, ICandleData {
  createdAt: Date;
  updatedAt: Date;
}

const CandleSchema = new Schema<ICandle>({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  timeframe: {
    type: String,
    required: true,
    enum: ['15min', '1hour', '1day'],
  },
  timestamp: {
    type: Date,
    required: true,
  },
  // OHLCV data
  open: {
    type: Number,
    required: true,
    min: 0,
  },
  high: {
    type: Number,
    required: true,
    min: 0,
  },
  low: {
    type: Number,
    required: true,
    min: 0,
  },
  close: {
    type: Number,
    required: true,
    min: 0,
  },
  volume: {
    type: Number,
    required: true,
    min: 0,
  },
  openInterest: {
    type: Number,
    min: 0,
  },
  // Basic derived metrics
  priceChange: { type: Number, required: true },
  priceChangePercent: { type: Number, required: true },
  range: { type: Number, required: true, min: 0 },
  bodySize: { type: Number, required: true, min: 0 },
  upperShadow: { type: Number, required: true, min: 0 },
  lowerShadow: { type: Number, required: true, min: 0 },
}, {
  timestamps: true,
});

// Optimized indexes for hierarchical storage
CandleSchema.index({ symbol: 1, timeframe: 1, timestamp: -1 }, { unique: true });
CandleSchema.index({ symbol: 1, timestamp: -1 });
CandleSchema.index({ timeframe: 1, timestamp: -1 });
CandleSchema.index({ timestamp: -1 });

// Updated TTL indexes for new retention policy
CandleSchema.index(
  { timestamp: 1 }, 
  { 
    expireAfterSeconds: 60 * 24 * 60 * 60, // 60 days
    partialFilterExpression: { timeframe: '15min' },
    name: 'ttl_15min_60days'
  }
);
CandleSchema.index(
  { timestamp: 1 }, 
  { 
    expireAfterSeconds: 180 * 24 * 60 * 60, // 180 days
    partialFilterExpression: { timeframe: '1hour' },
    name: 'ttl_1hour_180days'
  }
);
// Note: Daily candles (3 years) don't have TTL - they're kept indefinitely or archived manually

// Pre-save middleware to calculate derived fields
CandleSchema.pre('save', function(next) {
  this.priceChange = this.close - this.open;
  this.priceChangePercent = (this.priceChange / this.open) * 100;
  this.range = this.high - this.low;
  this.bodySize = Math.abs(this.close - this.open);
  
  const bodyTop = Math.max(this.open, this.close);
  const bodyBottom = Math.min(this.open, this.close);
  this.upperShadow = this.high - bodyTop;
  this.lowerShadow = bodyBottom - this.low;
  
  next();
});

// Static method to parse Upstox candle data
CandleSchema.statics.parseUpstoxCandle = function(symbol: string, timeframe: string, candleArray: number[]) {
  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    timestamp: new Date(candleArray[0]),
    open: candleArray[1],
    high: candleArray[2],
    low: candleArray[3],
    close: candleArray[4],
    volume: candleArray[5],
    openInterest: candleArray[6] || undefined
  };
};

export default mongoose.models.Candle || mongoose.model<ICandle>('Candle', CandleSchema);