# Personal Screener Backend - Quick Start Guide

## 🚀 Quick Setup

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (local or cloud)
- npm or yarn

### 1. Environment Setup
```bash
# Copy and edit environment variables
cp .env.example .env
# Update .env with your MongoDB URI and other settings
```

### 2. Install Dependencies
```bash
# Run the setup script
npm run setup

# Or manually:
npm install
npm run install:all
```

### 3. Update Environment Variables
Edit `.env` file with your configuration:
```env
MONGODB_URI=mongodb://localhost:27017/personal-screener
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
```

### 4. Start Development
```bash
# Start all services
npm run dev

# Or start individually:
npm run dev:auth    # Auth service on port 50051
npm run dev:gateway # Gateway on port 3000
```

## 🔧 Development

### Available Scripts
- `npm run setup` - Initial project setup
- `npm run dev` - Start all services in development
- `npm run build` - Build for production
- `npm run clean` - Clean build artifacts

### API Endpoints

#### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/logout` - Logout user

#### User Management (Admin)
- `GET /api/users` - List all users
- `GET /api/users/pending` - Get users pending approval
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `PATCH /api/users/:id/approve` - Approve user access
- `PATCH /api/users/:id/reject` - Revoke user access
- `DELETE /api/users/:id` - Delete user

### Default Admin User
Create the first admin user via registration, then manually update the database:
```javascript
// In MongoDB
db.users.updateOne(
  { email: "admin@example.com" },
  { 
    $set: { 
      role: "admin", 
      accessAllowed: true, 
      isActive: true 
    } 
  }
)
```

## 📁 Project Structure
```
screener-backend/
├── gateway/                    # API Gateway (Port 3000)
│   ├── src/
│   │   ├── clients/           # gRPC clients
│   │   ├── middleware/        # Auth, rate limiting, errors
│   │   ├── routes/            # REST API routes
│   │   ├── config/            # Gateway-specific config
│   │   └── index.ts           # Main entry point
│   └── package.json
├── services/auth/              # Auth Service (gRPC Port 50051)
│   ├── src/
│   │   ├── controllers/       # Business logic
│   │   ├── proto/             # gRPC definitions
│   │   ├── database.ts        # DB connection (re-exports shared)
│   │   ├── server.ts          # gRPC server
│   │   └── index.ts           # Main entry point
│   └── package.json
├── shared/                     # Shared modules across all services
│   ├── config/
│   │   └── index.ts           # Centralized configuration
│   ├── database/
│   │   ├── connection.ts      # MongoDB connection class
│   │   └── index.ts           # Database exports
│   ├── models/
│   │   ├── User.ts            # User Mongoose model
│   │   └── index.ts           # Model exports
│   ├── types/
│   │   └── index.ts           # TypeScript type definitions
│   ├── utils/
│   │   └── logger.ts          # Winston logger
│   └── index.ts               # Main shared exports
├── scripts/                    # Build and setup scripts
├── .env                        # Environment variables
├── .gitignore                 # Git ignore rules
├── README.md                  # Main documentation
├── SETUP.md                   # Quick start guide
└── package.json               # Root package.json
```

## 🔒 Security Features
- JWT-based authentication
- Rate limiting
- Password hashing with bcrypt
- Role-based access control
- Input validation
- CORS protection
- Security headers with Helmet

## 🐛 Troubleshooting

### Common Issues
1. **MongoDB Connection**: Ensure MongoDB is running and URI is correct
2. **Port Conflicts**: Check if ports 3000 and 50051 are available
3. **Dependencies**: Run `npm run install:all` if modules are missing

### Logs
- Gateway logs: `gateway/logs/`
- Auth service logs: `services/auth/logs/`
- Console output for development

## 📝 Next Steps
1. Add more microservices (stock screening, portfolio management)
2. Implement Upstox integration
3. Add real-time market data
4. Create frontend application
5. Add comprehensive testing
6. Set up CI/CD pipeline

---

**Happy Coding! 🚀**
