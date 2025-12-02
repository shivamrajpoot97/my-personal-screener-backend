import mongoose, { Document, Schema } from 'mongoose';

// --------------------------------------------------------------------------------
// 1) Compact feature key mappings
// --------------------------------------------------------------------------------
export const FEATURE_KEYS = {
  // Moving Averages
  sma5: 's5',
  sma10: 's10',
  sma20: 's20',
  sma50: 's50',
  sma200: 's200',
  ema9: 'e9',
  ema12: 'e12',
  ema21: 'e21',
  ema26: 'e26',

  // Momentum
  rsi: 'r',
  rsi14: 'r14',
  stochK: 'sk',
  stochD: 'sd',
  williamsR: 'wr',

  // Trend
  macd: 'm',
  macdSignal: 'ms',
  macdHistogram: 'mh',
  adx: 'adx',

  // Volatility
  bbUpper: 'bbu',
  bbMiddle: 'bbm',
  bbLower: 'bbl',
  atr: 'atr',

  // Volume
  volumeSma: 'vs',
  volumeRatio: 'vr',
  vwap: 'vw',
  moneyFlow: 'mf',

  // Price Action
  candlePattern: 'cp',
  trendDirection: 'td',

  // Support/Resistance
  pivot: 'piv',
  support1: 's1',
  support2: 's2',
  support3: 's3',
  resistance1: 'r1',
  resistance2: 'r2',
  resistance3: 'r3',

  // Market Structure
  higherHigh: 'hh',
  higherLow: 'hl',
  lowerHigh: 'lh',
  lowerLow: 'll',

  // Strength
  relativeStrength: 'rs',
  pricePosition: 'pp',
  volumeStrength: 'vstg'
} as const;

// Reverse mapping for full key lookup
export const REVERSE_FEATURE_KEYS = Object.fromEntries(
  Object.entries(FEATURE_KEYS).map(([full, short]) => [short, full])
);

// --------------------------------------------------------------------------------
// 2) Timeframe‐specific feature sets (for compact storage / validation)
// --------------------------------------------------------------------------------
export const TIMEFRAME_FEATURES = {
  '15min': ['s5', 's10', 'r', 'vw', 'atr', 'vs', 'cp'],               // 7 features
  '1hour': ['s20', 'e21', 'r14', 'm', 'ms', 'bbu', 'bbm', 'bbl', 'adx'], // 9 features
  '1day': ['s20', 's50', 's200', 'r14', 'adx', 'piv', 's1', 'r1', 'rs', 'pp'] // 10 features
} as const;
// --------------------------------------------------------------------------------
// 3) TypeScript interfaces
// --------------------------------------------------------------------------------
export interface ICandleFeaturesData {
  candleId: mongoose.Types.ObjectId;
  symbol: string;
  timeframe: keyof typeof TIMEFRAME_FEATURES;
  timestamp: Date;
  // compact feature bag, keys = FEATURE_KEYS values
  f: { [shortKey: string]: any };
}
export interface ICandleFeatures extends Document, ICandleFeaturesData {
  createdAt: Date;
  updatedAt: Date;

  // instance methods
  getFeature(featureName: keyof typeof FEATURE_KEYS): any;
  setFeature(featureName: keyof typeof FEATURE_KEYS, value: any): void;
  getAllFeatures(): Record<string, any>;
}

// --------------------------------------------------------------------------------
// 4) Schema definition
// --------------------------------------------------------------------------------
const CandleFeaturesSchema = new Schema<ICandleFeatures>(
  {
    candleId: {
      type: Schema.Types.ObjectId,
      ref: 'Candle',
      required: true,
      index: true
    },
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },
    timeframe: {
      type: String,
      required: true,
      enum: Object.keys(TIMEFRAME_FEATURES),
      index: true
    },
    timestamp: {
      type: Date,
      required: true,
      index: true
    },
    // single flexible container for all features
    f: {
      type: Schema.Types.Mixed,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// --------------------------------------------------------------------------------
// 5) Indexes
// --------------------------------------------------------------------------------
// unique per candle
CandleFeaturesSchema.index({ candleId: 1 }, { unique: true });

// fast lookups
CandleFeaturesSchema.index({ symbol: 1, timeframe: 1, timestamp: -1 });
CandleFeaturesSchema.index({ symbol: 1, timestamp: -1 });
CandleFeaturesSchema.index({ timestamp: -1 });

// feature‐specific indexes (dot notation)
CandleFeaturesSchema.index({ symbol: 1, 'f.r14': 1 }); // RSI14
CandleFeaturesSchema.index({ symbol: 1, 'f.s20': 1 }); // SMA20
CandleFeaturesSchema.index({ symbol: 1, 'f.m': 1 });   // MACD
CandleFeaturesSchema.index({ 'f.td': 1, symbol: 1 });  // trendDirection

// TTL for auto cleanup
CandleFeaturesSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 60 * 24 * 60 * 60, // 60 days
    partialFilterExpression: { timeframe: '15min' },
    name: 'ttl_features_15min_60days'
  }
);

CandleFeaturesSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 180 * 24 * 60 * 60, // 180 days
    partialFilterExpression: { timeframe: '1hour' },
    name: 'ttl_features_1hour_180days'
  }
);

// --------------------------------------------------------------------------------
// 6) Instance methods
// --------------------------------------------------------------------------------
CandleFeaturesSchema.methods.getFeature = function (
  this: ICandleFeatures,
  featureName: keyof typeof FEATURE_KEYS
) {
  const shortKey = FEATURE_KEYS[featureName];
  return shortKey ? this.f?.[shortKey] : undefined;
};

CandleFeaturesSchema.methods.setFeature = function (
  this: ICandleFeatures,
  featureName: keyof typeof FEATURE_KEYS,
  value: any
) {
  const shortKey = FEATURE_KEYS[featureName];
  if (!shortKey) return;
  if (!this.f) this.f = {};
  this.f[shortKey] = value;
};

CandleFeaturesSchema.methods.getAllFeatures = function (this: ICandleFeatures) {
  const result: Record<string, any> = {};
  for (const [shortKey, val] of Object.entries(this.f || {})) {
    const fullKey = REVERSE_FEATURE_KEYS[shortKey];
    if (fullKey) result[fullKey] = val;
  }
  return result;
};

// --------------------------------------------------------------------------------
// 7) Static helpers (bulk create & feature queries)
// --------------------------------------------------------------------------------
interface ICandleFeaturesModel extends mongoose.Model<ICandleFeatures> {
  createFromFeatures(
    candleId: mongoose.Types.ObjectId,
    symbol: string,
    timeframe: keyof typeof TIMEFRAME_FEATURES,
    timestamp: Date,
    features: Record<string, any>
  ): ICandleFeatures;

  findByFeature(
    featureName: keyof typeof FEATURE_KEYS,
    condition: any,
    options?: mongoose.QueryOptions
  ): mongoose.Query<ICandleFeatures[], ICandleFeatures>;
}

CandleFeaturesSchema.statics.createFromFeatures = function (
  this: ICandleFeaturesModel,
  candleId: mongoose.Types.ObjectId,
  symbol: string,
  timeframe: keyof typeof TIMEFRAME_FEATURES,
  timestamp: Date,
  features: Record<string, any>
) {
  const compact: Record<string, any> = {};
  const allowed = TIMEFRAME_FEATURES[timeframe] || [];

  for (const [fullKey, value] of Object.entries(features)) {
    const shortKey = FEATURE_KEYS[fullKey as keyof typeof FEATURE_KEYS];
    if (shortKey && allowed.includes(shortKey) && value != null) {
      compact[shortKey] = value;
    }
  }

  return new this({ candleId, symbol, timeframe, timestamp, f: compact });
};

CandleFeaturesSchema.statics.findByFeature = function (
  this: ICandleFeaturesModel,
  featureName: keyof typeof FEATURE_KEYS,
  condition: any,
  options: mongoose.QueryOptions = {}
) {
  const shortKey = FEATURE_KEYS[featureName];
  if (!shortKey) throw new Error(`Unknown feature ${featureName}`);
  return this.find({ [`f.${shortKey}`]: condition }, null, options);
};

// --------------------------------------------------------------------------------
// 8) Export the model
// --------------------------------------------------------------------------------
export default mongoose.models.CandleFeatures ||
  mongoose.model<ICandleFeatures, ICandleFeaturesModel>(
    'CandleFeatures',
    CandleFeaturesSchema
  );
