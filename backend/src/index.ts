import express, { Express } from 'express';
import { Server } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env';
import { connectDatabase, closeDatabase, isDatabaseConnected } from './config/database';
import { errorMiddleware } from './shared/middleware/error.middleware';
import { databaseCheckMiddleware } from './shared/middleware/database-check.middleware';
import authRoutes from './modules/auth/auth.routes';
import inventoryRoutes from './modules/inventory/item.routes';
import customerRoutes from './modules/customers/customer.routes';
import rentalRoutes from './modules/rentals/rental.routes';
import maintenanceRoutes from './modules/maintenance/maintenance.routes';
import transactionRoutes from './modules/transactions/transaction.routes';
import invoiceRoutes from './modules/invoices/invoice.routes';
import subscriptionRoutes from './modules/subscriptions/subscription.routes';
import reportRoutes from './modules/reports/report.routes';
import billingRoutes from './modules/billings/billing.routes';
import notificationRoutes from './modules/notification/notification.routes';
import companyRoutes from './modules/companies/company.routes';

const app: Express = express();

// Trust proxy (important for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// Compression middleware (gzip)
app.use(compression());

// Sanitize data to prevent NoSQL injection
app.use(mongoSanitize());

// CORS configuration
const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // In development, allow localhost on any port
      if (env.NODE_ENV === 'development' && origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS),
  max: parseInt(env.RATE_LIMIT_MAX_REQUESTS),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  const isDbConnected = isDatabaseConnected();
  
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    database: {
      connected: isDbConnected,
      status: isDbConnected ? 'connected' : 'disconnected',
    },
  });
});

// Detailed health check for monitoring
app.get('/health/detailed', (req, res) => {
  const isDbConnected = isDatabaseConnected();
  
  res.status(isDbConnected ? 200 : 503).json({
    success: isDbConnected,
    message: isDbConnected ? 'Server and database are healthy' : 'Database connection lost',
    timestamp: new Date().toISOString(),
    database: {
      connected: isDbConnected,
      status: isDbConnected ? 'connected' : 'disconnected',
    },
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api', customerRoutes);
app.use('/api', rentalRoutes);
app.use('/api', maintenanceRoutes);
app.use('/api', transactionRoutes);
app.use('/api', invoiceRoutes);
app.use('/api', subscriptionRoutes);
app.use('/api', reportRoutes);
app.use('/api/billings', billingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/company', companyRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handling middleware (must be last)
app.use(errorMiddleware);

// Start server
let server: Server | undefined;

const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();

    // Start listening
    const PORT = parseInt(env.PORT);
    server = app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📝 Environment: ${env.NODE_ENV}`);
      console.log(`🔗 API: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Close HTTP server first (stop accepting new requests)
  const currentServer = server;
  if (currentServer) {
    return new Promise<void>((resolve) => {
      currentServer.close(() => {
        console.log('✅ HTTP server closed');
        
        // Close database connection after server is closed
        closeDatabase()
          .then(() => {
            console.log('✅ Graceful shutdown completed');
            resolve();
            process.exit(0);
          })
          .catch((error) => {
            console.error('❌ Error during shutdown:', error);
            resolve();
            process.exit(1);
          });
      });

      // Force close after 10 seconds if graceful shutdown fails
      setTimeout(() => {
        console.error('⚠️  Forcing shutdown after timeout');
        closeDatabase()
          .catch(() => {})
          .finally(() => {
            process.exit(1);
          });
      }, 10000);
    });
  } else {
    // If server is not running, just close database
    try {
      await closeDatabase();
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
};

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

startServer();
