import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import router from './routes';
import { connectDB } from './utils/db';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import * as paymentController from './controllers/paymentController';
import { sumsubWebhook } from './controllers/sumsubController';
import passport from 'passport';
import './utils/passportConfig';
import winston, { format } from 'winston';
import expressWinston from 'express-winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import dotenv from 'dotenv';
import path from 'path';
import { I18n } from 'i18n';
import adminKycRoutes from './routes/adminKycRoutes';
import metricsRoutes from './routes/metricsRoutes';
import authRoutes from './routes/authRoutes';
import sumsubRoutes from './routes/sumsubRoutes';
import platformFeeRoutes from './routes/platformFeeRoutes';
import { PlatformFeeService } from './services/platformFeeService';
import xss from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import csurf from 'csurf';
import client from 'prom-client';
// express-validator is used in routes, so just add a comment for interview notes
// Example usage in a route:
// import { body, validationResult } from 'express-validator';
// app.post('/register', [body('email').isEmail()], (req, res) => { ... });

const translationPath = path.resolve(process.cwd(), 'src/translation');

const i18n = new I18n({
  locales: ['en', 'mt', 'pt', 'id', 'fil', 'vi', 'ko', 'th'],
  directory: translationPath,
  defaultLocale: 'en',
});

dotenv.config();

const app = express();
app.set('trust proxy', 1);

// Development-only heapdump route
if (process.env.NODE_ENV !== 'production') {
  // Dynamically require heapdump to avoid issues in production
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const heapdump = require('heapdump');
  app.get('/debug/heapdump', (req, res) => {
    const filename = path.join(__dirname, `../heapdump-${Date.now()}.heapsnapshot`);
    heapdump.writeSnapshot(filename, (err: Error | null, filename: string) => {
      if (err) return res.status(500).send('Heapdump failed');
      res.send(`Heapdump written to ${filename}`);
    });
  });
}

const logLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'info';
const logger = winston.createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.colorize(),
    format.printf(
      ({
        timestamp,
        level,
        message,
        meta,
      }: {
        timestamp: string;
        level: string;
        message: string;
        meta?: {
          req: { method: string; url: string };
          res: { statusCode: number };
          responseTime: number;
        };
      }) => {
        if (meta?.req) {
          return `${timestamp} ${level}: ${message} - ${meta.req.method} ${meta.req.url} - Status: ${meta?.res?.statusCode ?? 0} - ${meta.responseTime}ms`;
        }
        return `${timestamp} ${level}: ${message}`;
      },
    ),
  ),
  transports: [
    new winston.transports.Console(),
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],
});

app.use(i18n.init);
app.use(function (req, res, next) {
  i18n.setLocale(req, req.headers['accept-language']);
  next();
});

app.use(
  expressWinston.logger({
    winstonInstance: logger,
    meta: true,
    msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
    expressFormat: false,
    colorize: true,
  }),
);

app.use((req, res, next) => {
  console.log('Authorization header:', req.headers.authorization);
  next();
});

// Apply body parsers early
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security: Sanitize user input against XSS
app.use(xss());
// Security: Prevent MongoDB operator injection
app.use(mongoSanitize());
// Security: Rate limiting to prevent brute-force attacks
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://static.sumsub.com', "'unsafe-inline'"],
      frameSrc: ["'self'", 'https://api.sumsub.com'],
      connectSrc: ["'self'", 'https://api.sumsub.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Stripe-Signature', 'x-sumsub-signature'],
    credentials: true,
  }),
);

app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 24 * 60 * 60,
      autoRemove: 'native',
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    },
  }),
);

// Security: Prevent HTTP Parameter Pollution
app.use(hpp());

// Security: CSRF protection for forms and state-changing requests
app.use(csurf());

app.use(passport.initialize());
app.use(passport.session());

// Stripe webhook endpoint
app.post(
  '/auth/stripe/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.handleStripeWebhook,
);

// Sumsub webhook endpoint
app.post(
  '/api/auth/sumsub/webhook',
  express.raw({ type: 'application/json' }),
  sumsubWebhook,
);

// Prometheus metrics setup
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// HTTP request duration histogram
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'],
  buckets: [50, 100, 200, 300, 400, 500, 1000]
});
register.registerMetric(httpRequestDurationMicroseconds);

// Middleware to measure request durations
app.use((req, res, next) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.route?.path || req.path, code: res.statusCode });
  });
  next();
});

// Expose /metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health check endpoint for testing and monitoring
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'API is healthy' });
});

// Admin KYC routes
app.use('/api/auth/admin/kyc', adminKycRoutes);

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/sumsub', sumsubRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/platform-fee', platformFeeRoutes);

const initializeApp = async () => {
  try {
    await connectDB();
    logger.info('Database connected successfully');

    // Initialize platform fee service after database connection
    await PlatformFeeService.getInstance().initialize();
    logger.info('Platform fee service initialized');

    await paymentController.seedPaymentConfigs();
    logger.info('Payment configurations seeded successfully');
  } catch (error) {
    logger.error('Failed to initialize application', { error });
    process.exit(1);
  }
};

initializeApp();
app.use('/', router);

app.use(
  expressWinston.errorLogger({
    winstonInstance: logger,
  }),
);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  logger.error(err.message, { stack: err.stack });
  
  if (err.name === 'AuthenticationError') {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication failed',
      details: err.message 
    });
  }
  
  res.status(500).json({ 
    success: false, 
    error: 'Something went wrong!',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;