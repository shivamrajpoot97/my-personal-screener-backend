import mongoose, { Document, Schema } from 'mongoose';

export interface ICandleBackupData {
  symbol: string;
  originalTimeframe: string; // Original timeframe before conversion
  targetTimeframe: string;   // Converted timeframe
  date: Date;               // Date of the data (for daily grouping)
  candlesData: {
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    openInterest?: number;
  }[];
  featuresData?: {
    timestamp: Date;
    indicators: Record<string, any>;
  }[];
  compressionRatio: number; // How many original candles were compressed
  createdAt: Date;
}

export interface ICandleBackup extends Document, ICandleBackupData {}

const CandleBackupSchema = new Schema<ICandleBackup>({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  originalTimeframe: {
    type: String,
    required: true,
    enum: ['15min', '1hour'],
  },
  targetTimeframe: {
    type: String,
    required: true,
    enum: ['1hour', '1day'],
  },
  date: {
    type: Date,
    required: true,
  },
  candlesData: [{
    timestamp: { type: Date, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, required: true },
    openInterest: { type: Number },
  }],
  featuresData: [{
    timestamp: { type: Date, required: true },
    indicators: { type: Schema.Types.Mixed },
  }],
  compressionRatio: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
}, {
  timestamps: false, // We handle createdAt manually
});

// Indexes for efficient querying and cleanup
CandleBackupSchema.index({ symbol: 1, date: -1 });
CandleBackupSchema.index({ originalTimeframe: 1, targetTimeframe: 1, date: -1 });
CandleBackupSchema.index({ createdAt: -1 });

// TTL index for automatic cleanup after 2 years
CandleBackupSchema.index(
  { createdAt: 1 }, 
  { expireAfterSeconds: 2 * 365 * 24 * 60 * 60 } // 2 years
);

export default mongoose.models.CandleBackup || mongoose.model<ICandleBackup>('CandleBackup', CandleBackupSchema);