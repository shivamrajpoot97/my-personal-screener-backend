// Upstox API Types
export interface UpstoxAuth {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface UpstoxInstrument {
  instrument_key: string;
  exchange_token: string;
  tradingsymbol: string;
  name: string;
  last_price: number;
  expiry?: string;
  strike?: number;
  tick_size: number;
  lot_size: number;
  instrument_type: string;
  segment: string;
  exchange: string;
}

export interface UpstoxCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi?: number;
}

export interface UpstoxHistoricalData {
  status: string;
  data: {
    candles: number[][];
  };
}

export interface UpstoxLiveData {
  feeds: {
    [instrumentKey: string]: {
      ff: {
        marketFF: {
          ltpc: {
            ltp: number;
            ltt: string;
            ltq: string;
            cp: number;
          };
          marketOHLC: {
            ohlc: [number, number, number, number];
          };
          marketLevel: {
            bidAskQuote: Array<{
              bq: number;
              bp: number;
              aq: number;
              ap: number;
            }>;
          };
        };
      };
    };
  };
}

export interface CandleTimeframe {
  upstoxInterval: string;
  mongoTimeframe: string;
  minutes: number;
  retentionDays: number;
}

export interface SyncJobConfig {
  symbol: string;
  instrumentKey: string;
  fromDate: Date;
  toDate: Date;
  timeframe: CandleTimeframe;
}

export interface RedisLiveData {
  symbol: string;
  ltp: number;
  change: number;
  changePercent: number;
  volume: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  timestamp: Date;
}

// Updated timeframe configuration with new retention policy
export const UPSTOX_INTERVALS: { [key: string]: CandleTimeframe } = {
  '15min': {
    upstoxInterval: '15minute',
    mongoTimeframe: '15min',
    minutes: 15,
    retentionDays: 60
  },
  '1hour': {
    upstoxInterval: '1hour',
    mongoTimeframe: '1hour',
    minutes: 60,
    retentionDays: 180
  },
  '1day': {
    upstoxInterval: '1day',
    mongoTimeframe: '1day',
    minutes: 1440,
    retentionDays: 1095 // 3 years
  }
};

// Data population strategy configuration
export const DATA_POPULATION_STRATEGY = {
  // 15-minute candles for last 60 days
  highFrequency: {
    timeframe: UPSTOX_INTERVALS['15min'],
    days: 60,
    description: '15-minute candles for detailed recent analysis'
  },
  
  // 1-hour candles for 60-180 days ago (total 180 days retention)
  mediumFrequency: {
    timeframe: UPSTOX_INTERVALS['1hour'],
    days: 180,
    description: '1-hour candles for medium-term analysis'
  },
  
  // Daily candles for remaining time up to 3 years
  lowFrequency: {
    timeframe: UPSTOX_INTERVALS['1day'],
    days: 1095,
    description: 'Daily candles for long-term analysis'
  }
};

// Population phases for the script
export const POPULATION_PHASES = {
  phase1: {
    name: '15min_recent',
    timeframe: UPSTOX_INTERVALS['15min'],
    startDaysAgo: 60,
    endDaysAgo: 0,
    description: '15-minute data for last 60 days'
  },
  phase2: {
    name: '1hour_medium',
    timeframe: UPSTOX_INTERVALS['1hour'],
    startDaysAgo: 180,
    endDaysAgo: 0,
    description: '1-hour data for last 180 days'
  },
  phase3: {
    name: '1day_historical',
    timeframe: UPSTOX_INTERVALS['1day'],
    startDaysAgo: 1095,
    endDaysAgo: 180,
    description: 'Daily data for 180 days to 3 years ago'
  }
};
