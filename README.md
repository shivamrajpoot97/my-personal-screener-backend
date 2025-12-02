# Personal Screener Backend

## Architecture Overview

This is a microservices-based personal screener application backend built with Node.js, TypeScript, and gRPC for inter-service communication.

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│                 │    │                 │    │                 │
│     Client      │───▶│   API Gateway   │───▶│  Auth Service   │
│   Application   │    │    (Express)    │    │    (gRPC)       │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                         │
                              │                         │
                              ▼                         ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │                 │    │                 │
                       │ Candle Service  │    │   MongoDB       │
                       │   (Express)     │    │   Database      │
                       │                 │    │                 │
                       └─────────────────┘    └─────────────────┘
```

### Services

1. **API Gateway** (`gateway/`)
   - Main entry point for all client requests
   - User authentication and authorization
   - Request routing to appropriate microservices
   - Rate limiting and request validation
   - REST API endpoints for clients

2. **Authentication Service** (`services/auth/`)
   - User management (CRUD operations)
   - JWT token generation and validation
   - Password hashing and verification
   - Role-based access control
   - Upstox token management
   - gRPC server for internal service communication

3. **Candle Service** (`services/candle-service/`)
   - High-performance candle data storage and retrieval
   - Hierarchical data retention (15min → 1hour → 1day)
   - Technical indicators calculation and storage
   - Automated data conversion and cleanup
   - Multi-timeframe data access for strategies
   - Real-time and historical data APIs

4. **Future Services**
   - Stock Screening Service
   - Portfolio Management Service
   - Market Data Service
   - Notification Service

### Technology Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **API Gateway**: Express.js
- **Inter-Service Communication**: gRPC / REST
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT tokens
- **Scheduling**: node-cron for automated tasks
- **Environment**: dotenv for configuration

### Data Models

#### User Schema
```typescript
interface IUser {
  email: string;
  password: string;
  name: string;
  role: 'user' | 'admin' | 'moderator';
  upstoxAccessToken?: string;
  upstoxRefreshToken?: string;
  isActive: boolean;
  accessAllowed: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Candle Schema
```typescript
interface ICandle {
  symbol: string;
  timeframe: '15min' | '1hour' | '1day';
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openInterest?: number;
  // Derived metrics
  priceChange: number;
  priceChangePercent: number;
  range: number;
  bodySize: number;
  upperShadow: number;
  lowerShadow: number;
}
```

#### Technical Features Schema
```typescript
interface ICandleFeatures {
  candleId: ObjectId;
  symbol: string;
  timeframe: string;
  timestamp: Date;
  // Technical indicators (RSI, MACD, SMA, EMA, etc.)
  // Support/Resistance levels
  // Market structure indicators
}
```

### Project Structure

```
personal-screener-backend/
├── README.md
├── SETUP.md
├── package.json
├── .env
├── .gitignore
├── gateway/                    # API Gateway
│   ├── src/
│   │   ├── index.ts           # Gateway entry point
│   │   ├── routes/            # REST API routes
│   │   ├── middleware/        # Authentication, validation
│   │   ├── clients/           # gRPC clients
│   │   └── config/            # Gateway-specific config
│   └── package.json
├── services/
│   ├── auth/                  # Authentication Service
│   │   ├── src/
│   │   │   ├── index.ts       # Auth service entry point
│   │   │   ├── server.ts      # gRPC server
│   │   │   ├── controllers/   # Business logic
│   │   │   └── proto/         # Protocol buffer definitions
│   │   └── package.json
│   └── candle-service/        # Candle Data Service
│       ├── src/
│       │   ├── index.ts       # Service entry point
│       │   ├── services/      # Business logic services
│       │   │   ├── CandleService.ts           # Core CRUD operations
│       │   │   ├── CandleConverterService.ts  # Timeframe conversion
│       │   │   ├── CandleDataService.ts       # Strategy data APIs
│       │   │   └── CronService.ts             # Automated tasks
│       │   └── routes/        # REST API routes
│       ├── package.json
│       └── README.md          # Detailed service documentation
├── shared/                    # Shared modules across services
│   ├── config/                # Centralized configuration
│   ├── database/              # Database connection utilities
│   ├── models/                # Mongoose models
│   │   ├── User.ts           # User model
│   │   ├── Candle.ts         # Core candle model
│   │   ├── CandleFeatures.ts # Technical indicators model
│   │   └── CandleBackup.ts   # Backup/archive model
│   ├── types/                 # TypeScript type definitions
│   ├── utils/                 # Common utilities (logger, etc.)
│   └── index.ts               # Main shared exports
└── scripts/                   # Build and deployment scripts
```

### Environment Variables

```env
# Database
MONGODB_URI=mongodb://localhost:27017/personal-screener

# JWT Configuration
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Service Ports
GATEWAY_PORT=3000
AUTH_SERVICE_PORT=50051
CANDLE_SERVICE_PORT=3002

# Upstox API (for future integration)
UPSTOX_API_KEY=your-upstox-api-key
UPSTOX_API_SECRET=your-upstox-api-secret

# Environment
NODE_ENV=development
LOG_LEVEL=info
```

### Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set up Environment**
   ```bash
   cp .env.example .env
   # Update .env with your configuration
   ```

3. **Start Services**
   ```bash
   # Start Authentication Service
   npm run dev:auth

   # Start Candle Service
   npm run dev:candle

   # Start API Gateway
   npm run dev:gateway
   ```

### API Endpoints

#### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

#### User Management (Admin only)
- `GET /api/users` - List all users
- `GET /api/users/pending` - Get users pending approval
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `PATCH /api/users/:id/approve` - Approve user access
- `PATCH /api/users/:id/reject` - Revoke user access
- `DELETE /api/users/:id` - Delete user

#### Candle Data (Port 3002)
- `POST /api/candles` - Store single candle with features
- `POST /api/candles/batch` - Store multiple candles
- `GET /api/candles` - Query candles with filtering
- `GET /api/candles/latest/:symbol/:timeframe` - Get latest candle
- `GET /api/candles/available` - Get available symbols/timeframes
- `POST /api/candles/convert` - Manual timeframe conversion
- `POST /api/candles/parse-upstox` - Parse Upstox candle data
- `GET /api/candles/cron/status` - Check conversion job status

### Candle Service Features

#### Hierarchical Data Retention
- **15min candles**: Stored for 30 days, then converted to 1hour
- **1hour candles**: Stored for 6 months, then converted to 1day  
- **1day candles**: Stored permanently
- **Automated conversion**: Daily cron jobs at 1:00 AM and 2:00 AM UTC
- **Backup system**: Compressed historical data with 2-year retention

#### Technical Indicators Support
- **Moving Averages**: SMA (5,10,20,50,200), EMA (9,12,21,26)
- **Momentum**: RSI, Stochastic, Williams %R
- **Trend**: MACD, ADX, Trend Direction
- **Volatility**: Bollinger Bands, ATR
- **Volume**: VWAP, Volume Ratios, Money Flow
- **Levels**: Support/Resistance, Pivot Points
- **Structure**: Higher Highs/Lows, Market Structure

#### Multi-timeframe Analysis
```typescript
// Get data for trading strategies
const strategyData = await CandleDataService.getStrategyData({
  symbol: 'AAPL',
  timeframe: '1hour',
  periods: 50,
  requiredIndicators: ['rsi', 'macd', 'sma20']
});

// Multi-timeframe context
const multiData = await CandleDataService.getMultiTimeframeData(
  'AAPL', '1hour', 50, true, false
);
```

### Development Guidelines

1. **Code Structure**
   - Use TypeScript for type safety
   - Implement proper error handling
   - Follow RESTful API conventions
   - Use gRPC for inter-service communication

2. **Security**
   - JWT-based authentication
   - Password hashing with bcrypt
   - Input validation and sanitization
   - Rate limiting on gateway

3. **Database Design**
   - Separate collections for performance
   - Optimized indexes for queries
   - TTL indexes for automatic cleanup
   - Compound indexes for multi-field queries

4. **Performance**
   - Batch operations for bulk data
   - Connection pooling
   - Query optimization
   - Automatic data archival

### Monitoring and Health

#### Service Health Checks
```bash
# Gateway
curl http://localhost:3000/health

# Candle Service
curl http://localhost:3002/health

# Cron Job Status
curl http://localhost:3002/api/candles/cron/status
```

#### Logging
- Structured logging with Winston
- Different log levels (ERROR, WARN, INFO, DEBUG)
- Service-specific log contexts
- Error tracking and monitoring

### Deployment

- Docker containers for each service
- Environment-specific configurations
- Health checks and monitoring
- Load balancing for gateway
- Database replication and backups

### Future Enhancements

- [ ] Real-time WebSocket streaming for live data
- [ ] Advanced technical indicators and patterns
- [ ] Stock screening algorithms using candle data
- [ ] Portfolio tracking and analysis
- [ ] Alert system based on technical conditions
- [ ] Performance analytics and backtesting
- [ ] Data compression and archival optimization
- [ ] Horizontal scaling with database sharding
- [ ] Machine learning feature extraction
- [ ] Options and derivatives data support