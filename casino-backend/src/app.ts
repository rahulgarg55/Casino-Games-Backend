import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import router from './routes';
import { connectDB } from './utils/db';
import session from 'express-session';
import * as paymentController from './controllers/paymentController';
import passport from 'passport';
import './utils/passportConfig';
import winston, { format } from 'winston';
import expressWinston from 'express-winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const app = express();

// Logger configuration
const logLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'info';
const logger = winston.createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.colorize(),
    format.printf(({ timestamp, level, message, meta }: { 
      timestamp: string; 
      level: string; 
      message: string; 
      meta?: { 
        req: { method: string; url: string }; 
        res: { statusCode: number }; 
        responseTime: number 
      } 
    }) => {
      if (meta?.req) {
        return `${timestamp} ${level}: ${message} - ${meta.req.method} ${meta.req.url} - Status: ${meta.res.statusCode} - ${meta.responseTime}ms`;
      }
      return `${timestamp} ${level}: ${message}`;
    })
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

// Request logging middleware
app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
  expressFormat: false,
  colorize: true,
}));

// Important: Stripe webhook route must come before body parsers
app.post(
  '/api/auth/stripe/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.handleStripeWebhook
);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Stripe-Signature'],
  credentials: true,
}));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

// Body parsers - after webhook route
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication
app.use(passport.initialize());
app.use(passport.session());

// Database connection
connectDB();

// Routes
app.use('/', router);

// Error logging
app.use(expressWinston.errorLogger({
  winstonInstance: logger,
}));

// Error handling
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Something went wrong!' });
});

export default app;
