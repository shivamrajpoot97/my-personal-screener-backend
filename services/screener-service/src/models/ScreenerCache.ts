import mongoose, { Schema, Document } from 'mongoose';

export interface IScreenerCache extends Document {
  cacheKey: string; // Unique identifier for the scan (hash of filters + timeframe)
  scanType: 'wyckoff' | 'custom';
  filters: any; // The filters used for scanning
  timeframe: string;
  results: any[]; // Cached results
  metadata: {
    totalStocks: number;
    matchedStocks: number;
    executionTime: string;
    lastUpdated: Date;
    dataDate: Date; // Which date's data was used
  };
  expiresAt: Date; // Auto-expire cache
  createdAt: Date;
  updatedAt: Date;
}

const ScreenerCacheSchema = new Schema<IScreenerCache>({
  cacheKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  scanType: {
    type: String,
    enum: ['wyckoff', 'custom'],
    required: true,
    index: true
  },
  filters: {
    type: Schema.Types.Mixed,
    required: true
  },
  timeframe: {
    type: String,
    required: true,
    index: true
  },
  results: {
    type: [Schema.Types.Mixed],
    default: []
  },
  metadata: {
    totalStocks: { type: Number, default: 0 },
    matchedStocks: { type: Number, default: 0 },
    executionTime: { type: String, default: '0s' },
    lastUpdated: { type: Date, default: Date.now },
    dataDate: { type: Date, required: true }
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true // TTL index
  }
}, {
  timestamps: true
});

// Create TTL index to auto-delete expired caches
ScreenerCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Create compound index for faster lookups
ScreenerCacheSchema.index({ scanType: 1, timeframe: 1, cacheKey: 1 });

export const ScreenerCache = mongoose.model<IScreenerCache>('ScreenerCache', ScreenerCacheSchema);
